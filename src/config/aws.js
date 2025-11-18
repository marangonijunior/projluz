const AWS = require('aws-sdk');
require('dotenv').config();

// Configuração do AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// Instância do Rekognition
const rekognition = new AWS.Rekognition();

module.exports = {
  rekognition,
  config: {
    region: process.env.AWS_REGION || 'us-east-1',
    minConfidence: parseFloat(process.env.MIN_CONFIDENCE) || 95,
    digitLength: parseInt(process.env.DIGIT_LENGTH) || 6
  }
};
