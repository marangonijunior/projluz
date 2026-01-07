require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDatabase } = require('./config/database');
const ProcessadorLotesAutomatico = require('./scripts/processadorLotesAutomatico');
const logger = require('./services/logger');

// Iniciar servidor HTTP para Heroku
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger de requisições
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Importar rotas da API
const lotesRoutes = require('./api/routes/lotes');
const estatisticasRoutes = require('./api/routes/estatisticas');

app.use('/api/lotes', lotesRoutes);
app.use('/api/estatisticas', estatisticasRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    servidor: process.env.SERVIDOR_ID || 'servidor_A',
    versao: '2.0.0',
    uptime: process.uptime()
  });
});

// Rota de informações sobre o sistema
app.get('/', (req, res) => {
  res.json({
    projeto: 'Projluz - Sistema de Processamento de Plaquetas',
    versao: '2.0.0',
    servidor: process.env.SERVIDOR_ID || 'servidor_A',
    endpoints: {
      lotes: '/api/lotes',
      estatisticas: '/api/estatisticas',
      health: '/health'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Erro na requisição:', err);
  res.status(err.status || 500).json({
    erro: err.message || 'Erro interno do servidor',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ erro: 'Endpoint não encontrado' });
});

// Iniciar servidor HTTP
app.listen(PORT, async () => {
  logger.info('');
  logger.info('╔════════════════════════════════════════════════╗');
  logger.info('║    PROJLUZ v2.0 - PROCESSAMENTO AUTOMÁTICO    ║');
  logger.info('║        MongoDB + AWS + HTTP + Email           ║');
  logger.info('╚════════════════════════════════════════════════╝');
  logger.info('');
  logger.info(`🌐 Servidor HTTP rodando na porta ${PORT}`);
  
  // Conectar ao MongoDB antes de iniciar processador
  try {
    logger.info('📦 Conectando ao MongoDB...');
    await connectDatabase();
    logger.info('✅ MongoDB conectado - API pronta para receber requisições');
    
    // Iniciar processador automático
    logger.info('');
    logger.info('🤖 Iniciando processador automático de lotes...');
    const processador = new ProcessadorLotesAutomatico();
    
    // Handlers para encerramento gracioso
    process.on('SIGINT', () => processador.parar());
    process.on('SIGTERM', () => processador.parar());
    
    await processador.iniciar();
    
  } catch (error) {
    logger.error('❌ Erro ao iniciar sistema:', error);
    process.exit(1);
  }
});
