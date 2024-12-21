require('dotenv').config();
const jwt = require('jsonwebtoken');

const accessKey = {
  developer_id: process.env.DEVELOPER_ID, 
  key_id: process.env.KEY_ID,
  signing_secret: process.env.SIGNING_SECRET,
};

const generateJWTToken = () => {
  const data = {
    aud: 'doordash',
    iss: accessKey.developer_id,
    kid: accessKey.key_id,
    exp: Math.floor(Date.now() / 1000 + 300),
    iat: Math.floor(Date.now() / 1000), 
  };

  const headers = { algorithm: 'HS256', header: { 'dd-ver': 'DD-JWT-V1' } };

  return jwt.sign(
    data,
    Buffer.from(accessKey.signing_secret, 'base64'),
    headers,
  );
};

// Generate the token and log it
const token = generateJWTToken();
console.log(token);
