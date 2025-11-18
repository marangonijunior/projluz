const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Criar diretório de logs se não existir
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Formato customizado para logs
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`;
    }
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

// Criar logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports: [
    // Log em arquivo - todos os logs
    new winston.transports.File({
      filename: path.join(logsDir, `processamento_${new Date().toISOString().split('T')[0]}.log`),
      maxsize: 10485760, // 10MB
      maxFiles: 30 // 30 dias
    }),
    // Log em arquivo - apenas erros
    new winston.transports.File({
      filename: path.join(logsDir, 'erros.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 30
    }),
    // Log no console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      )
    })
  ]
});

// Métodos auxiliares
logger.logBatchStart = (batchName) => {
  logger.info(`═══════════════════════════════════════`);
  logger.info(`🚀 Iniciando processamento do lote: ${batchName}`);
  logger.info(`═══════════════════════════════════════`);
};

logger.logBatchEnd = (batchName, stats) => {
  logger.info(`═══════════════════════════════════════`);
  logger.info(`✅ Lote concluído: ${batchName}`);
  logger.info(`📊 Total: ${stats.total} | Sucesso: ${stats.success} | Falhas: ${stats.failures}`);
  logger.info(`⏱️  Tempo total: ${stats.duration}`);
  logger.info(`═══════════════════════════════════════`);
};

logger.logPhotoProcessing = (photoId, fileId) => {
  logger.info(`📸 Processando foto - ID: ${photoId} | File: ${fileId}`);
};

logger.logPhotoSuccess = (photoId, number, confidence) => {
  logger.info(`✅ Sucesso - ID: ${photoId} | Número: ${number} | Confiança: ${confidence}%`);
};

logger.logPhotoFailure = (photoId, reason) => {
  logger.warn(`❌ Falha - ID: ${photoId} | Motivo: ${reason}`);
};

module.exports = logger;
