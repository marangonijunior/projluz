require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { connectDatabase } = require('./config/database');
const { verifyEmailConfig } = require('./config/email');
const { importarTodosLotes } = require('./scripts/importLotes');
const { processarLotesPendentes } = require('./controllers/loteProcessor');
const { enviarRelatorioDiario } = require('./services/dailyReportService');
const { enviarRelatorioSemanal } = require('./services/weeklyReportService');
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

// Variável para controlar se já está processando
let isProcessing = false;

/**
 * Função principal de processamento v2.0 - MongoDB
 */
async function main() {
  if (isProcessing) {
    logger.warn('⚠️  Processamento já em andamento, aguardando conclusão...');
    return;
  }

  try {
    isProcessing = true;
    logger.info('');
    logger.info('════════════════════════════════════════════════');
    logger.info('🚀 Iniciando ciclo de processamento v2.0');
    logger.info('════════════════════════════════════════════════');
    logger.info('');

    // 1. Conectar MongoDB
    logger.info('� Conectando ao MongoDB...');
    await connectDatabase();
    logger.info('✅ MongoDB conectado');

    // 2. Verificar configuração de email
    logger.info('📧 Verificando configuração de email...');
    await verifyEmailConfig();

    // 3. IMPORTAR novos lotes do Drive
    logger.info('');
    logger.info('📥 FASE 1: Importação de Lotes');
    logger.info('─────────────────────────────────────────────');
    const resultadoImport = await importarTodosLotes();
    
    if (resultadoImport.sucesso > 0) {
      logger.info(`✅ ${resultadoImport.sucesso} lote(s) importado(s)`);
    }
    if (resultadoImport.duplicados > 0) {
      logger.info(`⏭️  ${resultadoImport.duplicados} lote(s) duplicado(s) ignorado(s)`);
    }
    if (resultadoImport.erros > 0) {
      logger.warn(`⚠️  ${resultadoImport.erros} erro(s) na importação`);
    }

    // 4. PROCESSAR lotes pendentes
    logger.info('');
    logger.info('⚙️  FASE 2: Processamento de Fotos');
    logger.info('─────────────────────────────────────────────');
    const resultadoProcess = await processarLotesPendentes();
    
    logger.info('');
    logger.info('════════════════════════════════════════════════');
    logger.info('✅ CICLO CONCLUÍDO');
    logger.info('════════════════════════════════════════════════');
    logger.info(`� Importação: ${resultadoImport.sucesso} novos lotes`);
    logger.info(`⚙️  Processamento: ${resultadoProcess.lotesProcessados} lote(s)`);
    logger.info(`📸 Total de fotos: ${resultadoProcess.totalFotos}`);
    logger.info(`✅ Sucesso: ${resultadoProcess.fotosSucesso}`);
    logger.info(`❌ Falhas: ${resultadoProcess.fotosFalha}`);
    logger.info('════════════════════════════════════════════════');
    logger.info('');

  } catch (error) {
    logger.error('');
    logger.error('════════════════════════════════════════════════');
    logger.error('❌ ERRO CRÍTICO NO PROCESSAMENTO');
    logger.error('════════════════════════════════════════════════');
    logger.error(error);
    logger.error('════════════════════════════════════════════════');
    logger.error('');
  } finally {
    isProcessing = false;
  }
}

/**
 * Configurar e iniciar scheduler
 */
function startScheduler() {
  // A cada 6 horas: 0 */6 * * *
  const cronSchedule = process.env.CRON_SCHEDULE || '0 */6 * * *';

  logger.info('');
  logger.info('════════════════════════════════════════════════');
  logger.info('⏰ Scheduler configurado');
  logger.info(`📅 Padrão CRON: ${cronSchedule} (a cada 6 horas)`);
  logger.info('════════════════════════════════════════════════');
  logger.info('');

  // Validar padrão CRON
  if (!cron.validate(cronSchedule)) {
    logger.error('❌ Padrão CRON inválido!');
    logger.error(`Padrão fornecido: ${cronSchedule}`);
    logger.error('Exemplo válido: 0 0 * * * (todo dia à meia-noite)');
    process.exit(1);
  }

  // Agendar execução de processamento (a cada 6 horas)
  cron.schedule(cronSchedule, async () => {
    logger.info('⏰ Scheduler ativado - Iniciando processamento...');
    await main();
  });

  // Agendar envio de relatório diário (todo dia às 06:00)
  cron.schedule('0 6 * * *', async () => {
    logger.info('📧 Scheduler de relatório diário ativado...');
    try {
      await enviarRelatorioDiario();
    } catch (error) {
      logger.error('Erro ao enviar relatório diário:', error);
    }
  });

  // Agendar envio de relatório semanal (toda sexta-feira às 15:00)
  cron.schedule('0 15 * * 5', async () => {
    logger.info('📧 Scheduler de relatório semanal ativado...');
    try {
      await enviarRelatorioSemanal();
    } catch (error) {
      logger.error('Erro ao enviar relatório semanal:', error);
    }
  });

  logger.info('✅ Scheduler ativo e aguardando próxima execução');
  logger.info('⏰ Processamento: 00:00, 06:00, 12:00, 18:00');
  logger.info('📧 Relatório diário: 06:00 (para contact@marangonijunior.co.uk)');
  logger.info('📧 Relatório semanal: Sexta 15:00 (para EMAIL_TO)');
  logger.info('ℹ️  Não será executado imediatamente - apenas nos horários programados');
  logger.info('');
}

/**
 * Tratamento de sinais para shutdown graceful
 */
process.on('SIGINT', () => {
  logger.info('');
  logger.info('⚠️  Recebido sinal SIGINT - Encerrando aplicação...');
  
  if (isProcessing) {
    logger.warn('⚠️  Processamento em andamento será interrompido');
  }
  
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('');
  logger.info('⚠️  Recebido sinal SIGTERM - Encerrando aplicação...');
  process.exit(0);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    isProcessing
  });
});

// Status endpoint
app.get('/', (req, res) => {
  res.json({
    nome: 'ProjLuz v2.0 - Processamento Automático',
    versao: '2.0.0',
    status: isProcessing ? 'processando' : 'aguardando',
    cronSchedule: process.env.CRON_SCHEDULE || '0 */6 * * *',
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

// Iniciar servidor HTTP
app.listen(PORT, async () => {
  logger.info('');
  logger.info('╔════════════════════════════════════════════════╗');
  logger.info('║    PROJLUZ v2.0 - PROCESSAMENTO AUTOMÁTICO    ║');
  logger.info('║        MongoDB + AWS + Drive + Email          ║');
  logger.info('╚════════════════════════════════════════════════╝');
  logger.info('');
  logger.info(`🌐 Servidor HTTP rodando na porta ${PORT}`);
  
  // Conectar ao MongoDB antes de iniciar scheduler e rotas
  try {
    logger.info('📦 Conectando ao MongoDB...');
    await connectDatabase();
    logger.info('✅ MongoDB conectado - API pronta para receber requisições');
  } catch (error) {
    logger.error('❌ Erro ao conectar MongoDB:', error);
    logger.error('⚠️  API funcionará parcialmente sem banco de dados');
  }
  
  // Iniciar scheduler após servidor estar pronto
  startScheduler();
});
