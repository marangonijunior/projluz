const express = require('express');
const cors = require('cors');
const { connectDatabase } = require('../config/database');
const logger = require('../services/logger');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger de requisições
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
const lotesRoutes = require('./routes/lotes');
const estatisticasRoutes = require('./routes/estatisticas');

app.use('/api/lotes', lotesRoutes);
app.use('/api/estatisticas', estatisticasRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    nome: 'ProjLuz API',
    versao: '2.0.0',
    endpoints: {
      lotes: '/api/lotes',
      estatisticas: '/api/estatisticas',
      health: '/health'
    },
    documentacao: {
      listarLotes: 'GET /api/lotes?status=pendente&page=1&limit=20',
      detalhesLote: 'GET /api/lotes/:nome',
      exportarCSV: 'GET /api/lotes/:nome/export',
      listarFotos: 'GET /api/lotes/:nome/fotos?status=sucesso&page=1&limit=50',
      processarLote: 'POST /api/lotes/:nome/processar',
      statusLote: 'GET /api/lotes/:nome/status',
      estatisticas: 'GET /api/estatisticas'
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

const PORT = process.env.API_PORT || 3000;

const startServer = async () => {
  try {
    // Conectar ao MongoDB
    await connectDatabase();
    
    // Iniciar servidor
    app.listen(PORT, () => {
      logger.info(`API rodando na porta ${PORT}`);
      logger.info(`Documentação: http://localhost:${PORT}/`);
    });
  } catch (error) {
    logger.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
};

// Iniciar apenas se executado diretamente
if (require.main === module) {
  startServer();
}

module.exports = app;
