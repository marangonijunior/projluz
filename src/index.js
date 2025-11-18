require('dotenv').config();
const cron = require('node-cron');
const { connectDatabase } = require('./config/database');
const { verifyEmailConfig } = require('./config/email');
const { importarTodosLotes } = require('./scripts/importLotes');
const { processarLotesPendentes } = require('./controllers/loteProcessor');
const logger = require('./services/logger');

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

  // Agendar execução
  cron.schedule(cronSchedule, async () => {
    logger.info('⏰ Scheduler ativado - Iniciando processamento...');
    await main();
  });

  logger.info('✅ Scheduler ativo e aguardando próxima execução');
  logger.info('');

  // Executar imediatamente ao iniciar
  logger.info('� Executando primeiro ciclo imediatamente...');
  logger.info('');
  main();
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

// Iniciar aplicação
logger.info('');
logger.info('╔════════════════════════════════════════════════╗');
logger.info('║    PROJLUZ v2.0 - PROCESSAMENTO AUTOMÁTICO    ║');
logger.info('║        MongoDB + AWS + Drive + Email          ║');
logger.info('╚════════════════════════════════════════════════╝');
logger.info('');

startScheduler();
