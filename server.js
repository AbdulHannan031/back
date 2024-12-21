require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Use your secret key

// Express setup
const app = express();
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

// DoorDash API configurations
let DOORDASH_API_KEY = process.env.DOORDASH_API_KEY;
const DOORDASH_API_BASE_URL = process.env.DOORDASH_API_BASE_URL;

// Assuming you have these keys in your .env file
const accessKey = {
  developer_id: process.env.DEVELOPER_ID,
  key_id: process.env.KEY_ID,
  signing_secret: process.env.SIGNING_SECRET,
};

// Helper function to generate the JWT token
const generateJWTToken = () => {
  const data = {
    aud: 'doordash',
    iss: accessKey.developer_id,
    kid: accessKey.key_id,
    exp: Math.floor(Date.now() / 1000 + 300), // Set to expire in 5 minutes
    iat: Math.floor(Date.now() / 1000), // Issued At claim
  };

  const headers = { algorithm: 'HS256', header: { 'dd-ver': 'DD-JWT-V1' } };

  // Generate the JWT token
  const token = jwt.sign(
    data,
    Buffer.from(accessKey.signing_secret, 'base64'),
    headers
  );

  return token;
};

// Save the new JWT token into the .env file
const updateEnvFile = (token) => {
  const envPath = path.resolve(__dirname, '.env');
  const envFileContent = fs.readFileSync(envPath, 'utf-8');

  // Replace the DOORDASH_API_KEY with the new token
  const updatedContent = envFileContent.replace(
    /DOORDASH_API_KEY=.+/,
    `DOORDASH_API_KEY=${token}`
  );

  // Save the updated .env file
  fs.writeFileSync(envPath, updatedContent);
  console.log('DOORDASH_API_KEY updated in .env file');
};

// Automatically generate the JWT token and update the .env file every 5 minutes
const autoUpdateToken = () => {
  const token = generateJWTToken();
  updateEnvFile(token);

  setInterval(() => {
    const token = generateJWTToken();
    updateEnvFile(token);
  }, 5 * 60 * 1000); // Update every 5 minutes (300,000ms)
};

// Watch the .env file for changes and reload environment variables
const watchEnvFile = () => {
  chokidar.watch(path.resolve(__dirname, '.env')).on('change', () => {
    console.log('.env file changed, reloading environment variables...');
    require('dotenv').config(); // Reload .env variables
    DOORDASH_API_KEY = process.env.DOORDASH_API_KEY; // Update in-memory variable
    console.log('New DOORDASH_API_KEY:', DOORDASH_API_KEY);
  });
};

// Helper function to get a delivery quote
const getDeliveryQuote = async (quoteDetails, retry = false) => {
  const url = `${DOORDASH_API_BASE_URL}/drive/v2/quotes`;
  try {
    const response = await axios.post(url, quoteDetails, {
      headers: {
        Authorization: `Bearer ${DOORDASH_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error getting delivery quote:', error.response?.data || error.message);

    // If token has expired and retry flag is false, regenerate the token and retry
    if (error.response?.data?.code === 'authentication_error' && !retry) {
      console.log('JWT expired, regenerating the token and retrying..');
      const newToken = generateJWTToken();
      updateEnvFile(newToken); // Update the token in .env file
      process.env.DOORDASH_API_KEY = newToken;

      return await getDeliveryQuote(quoteDetails, true);
    }

    throw error;
  }
};

// API route for delivery quotes
app.post('/delivery/quote', async (req, res) => {
  try {
    const { pickup_address, dropoff_address, dropoff_phone_number } = req.body;

    const quoteDetails = {
      external_delivery_id: `delivery_${Date.now()}`,
      pickup_address,
      dropoff_address,
      dropoff_phone_number,
    };

    const quoteResponse = await getDeliveryQuote(quoteDetails);
    res.json(quoteResponse);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get delivery quote' });
  }
});

app.post('/create-payment-intent', async (req, res) => {
  const { amount, currency, paymentMethodId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // amount in cents
      currency: currency,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start the token updating process
autoUpdateToken();
watchEnvFile();

// Start the Express server
app.listen(3001, () => {
  console.log('Server running at http://localhost:3001');
});
