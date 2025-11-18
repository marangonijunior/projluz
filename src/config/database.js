const mongoose = require('mongoose');
const logger = require('../services/logger');

const connectDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI não definida no arquivo .env');
    }
    
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };
    
    await mongoose.connect(mongoUri, options);
    
    logger.info('MongoDB conectado com sucesso');
    logger.info(`Database: ${mongoose.connection.name}`);
    
  } catch (error) {
    logger.error('Erro ao conectar ao MongoDB:', error);
    process.exit(1);
  }
};

// Event listeners
mongoose.connection.on('connected', () => {
  logger.info('Mongoose conectado ao MongoDB');
});

mongoose.connection.on('error', (err) => {
  logger.error('Erro na conexão do Mongoose:', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose desconectado do MongoDB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('Mongoose desconectado devido ao término da aplicação');
  process.exit(0);
});

module.exports = { connectDatabase };
