require('dotenv').config();
const mongoose = require('mongoose');
const { google } = require('googleapis');
const logger = require('../utils/logger');
const { importarLoteHTTP } = require('./importarLoteHTTP');
const { processarLotePendente } = require('../controllers/loteProcessor');

/**
 * Processador automático de lotes
 * Executa a cada 3 horas:
 * 1. Lista arquivos do Google Drive
 * 2. Pega o próximo lote não processado
 * 3. Importa para MongoDB
 * 4. Processa com AWS Rekognition
 */
class ProcessadorLotesAutomatico {
  constructor() {
    this.intervalo = 3 * 60 * 60 * 1000; // 3 horas em ms
    this.processando = false;
    this.ultimoLoteProcessado = null;
  }

  /**
   * Lista todos os arquivos de lote do Google Drive
   */
  async listarLotesDisponiveis() {
    try {
      // Autenticar usando variáveis de ambiente (Heroku)
      const credentials = {
        type: process.env.GOOGLE_TYPE,
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: process.env.GOOGLE_AUTH_URI,
        token_uri: process.env.GOOGLE_TOKEN_URI,
        auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
        client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL
      };
      
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      });
      
      const drive = google.drive({ version: 'v3', auth });
      const folderId = process.env.FOLDER_ID; // Pasta raiz
      
      // Identificador do servidor (servidor_A, servidor_B, etc)
      const servidorId = process.env.SERVIDOR_ID || 'servidor_A';
      
      logger.info(`📂 Buscando pasta ${servidorId} no Google Drive...`);
      
      // 1. Buscar pasta do servidor dentro da pasta raiz
      const folderQuery = `name = '${servidorId}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      
      const folderResponse = await drive.files.list({
        q: folderQuery,
        fields: 'files(id, name)',
        pageSize: 1
      });

      if (!folderResponse.data.files || folderResponse.data.files.length === 0) {
        logger.warn(`⚠️  Pasta ${servidorId} não encontrada no Google Drive`);
        return [];
      }

      const servidorFolderId = folderResponse.data.files[0].id;
      logger.info(`✅ Pasta ${servidorId} encontrada (ID: ${servidorFolderId})`);
      
      // 2. Buscar arquivos Excel dentro da pasta do servidor
      const filesQuery = `'${servidorFolderId}' in parents and name contains 'Extração_das_Plaquetas_Lote_' and trashed = false`;
      
      logger.info(`📋 Listando lotes dentro de ${servidorId}...`);
      
      const response = await drive.files.list({
        q: filesQuery,
        fields: 'files(id, name, size, createdTime)',
        orderBy: 'name asc',
        pageSize: 100
      });

      logger.info(`📊 ${response.data.files?.length || 0} arquivo(s) encontrado(s)`);

      return response.data.files || [];
    } catch (error) {
      logger.error('Erro ao listar lotes do Drive:', error);
      throw error;
    }
  }

  /**
   * Encontra o próximo lote a ser processado
   */
  async encontrarProximoLote() {
    const lotes = await this.listarLotesDisponiveis();
    
    logger.info(`📋 Lotes disponíveis no Drive: ${lotes.length}`);
    
    // Conectar ao MongoDB para verificar quais já foram processados
    await mongoose.connect(process.env.MONGODB_URI);
    
    const Foto = require('../models/Foto');
    
    for (const arquivo of lotes) {
      // Extrair número do lote
      const match = arquivo.name.match(/Lote[_\s]?(\d+)/i);
      if (!match) continue;
      
      const numeroLote = match[1].padStart(2, '0');
      const nomeLote = `Lote_${numeroLote}`;
      
      // Verificar se já foi importado
      const fotoExistente = await Foto.findOne({ lote: nomeLote }).limit(1);
      
      if (!fotoExistente) {
        logger.info(`✅ Próximo lote encontrado: ${arquivo.name}`);
        // Retornar arquivo com informações adicionais
        return {
          ...arquivo,
          servidorId: process.env.SERVIDOR_ID || 'servidor_A'
        };
      } else {
        logger.info(`⏭️  Lote ${nomeLote} já importado (pulando)`);
      }
    }
    
    logger.info('ℹ️  Nenhum lote novo disponível');
    return null;
  }

  /**
   * Processa um ciclo completo (importação + processamento)
   */
  async processarCiclo() {
    if (this.processando) {
      logger.warn('⚠️  Processamento anterior ainda em andamento, pulando ciclo');
      return;
    }

    this.processando = true;
    
    try {
      logger.info('');
      logger.info('='.repeat(80));
      logger.info('🚀 INICIANDO NOVO CICLO DE PROCESSAMENTO');
      logger.info(`⏰ ${new Date().toLocaleString('pt-BR')}`);
      logger.info('='.repeat(80));
      
      // Encontrar próximo lote
      const proximoLote = await this.encontrarProximoLote();
      
      if (!proximoLote) {
        logger.info('✅ Todos os lotes disponíveis já foram processados');
        logger.info('⏸️  Aguardando novos lotes no Google Drive...');
        return;
      }

      // Importar lote
      logger.info('');
      logger.info('📥 FASE 1: IMPORTAÇÃO');
      logger.info('-'.repeat(80));
      
      const resultadoImport = await importarLoteHTTP(
        proximoLote.name, 
        proximoLote.id,
        proximoLote.servidorId
      );
      
      if (!resultadoImport.success) {
        logger.error('❌ Falha na importação, abortando ciclo');
        return;
      }

      this.ultimoLoteProcessado = resultadoImport.lote;

      // Reconectar MongoDB (importação desconectou)
      await mongoose.connect(process.env.MONGODB_URI);

      // Processar com AWS
      logger.info('');
      logger.info('🔍 FASE 2: PROCESSAMENTO AWS');
      logger.info('-'.repeat(80));
      
      const resultadoProcess = await processarLotePendente(resultadoImport.lote);
      
      logger.info('');
      logger.info('='.repeat(80));
      logger.info('✅ CICLO CONCLUÍDO COM SUCESSO');
      logger.info(`   Lote: ${resultadoImport.lote}`);
      logger.info(`   Importadas: ${resultadoImport.importadas}`);
      logger.info(`   Processadas: ${resultadoProcess?.processadas || 0}`);
      logger.info(`   ⏰ Próximo ciclo em 3 horas`);
      logger.info('='.repeat(80));
      
    } catch (error) {
      logger.error('❌ Erro no ciclo de processamento:', error);
    } finally {
      this.processando = false;
      await mongoose.disconnect();
    }
  }

  /**
   * Inicia o processador automático
   */
  async iniciar() {
    const servidorId = process.env.SERVIDOR_ID || 'servidor_A';
    
    logger.info('');
    logger.info('╔═══════════════════════════════════════════════════════════════╗');
    logger.info('║   🤖 PROCESSADOR AUTOMÁTICO DE LOTES - SISTEMA HTTP          ║');
    logger.info('╚═══════════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info('⚙️  Configuração:');
    logger.info(`   • Servidor: ${servidorId}`);
    logger.info(`   • Intervalo: 3 horas`);
    logger.info(`   • Modo: HTTP apenas`);
    logger.info(`   • AWS Rekognition: Ativo`);
    logger.info('');

    // NÃO executar no startup (apenas no cron agendado)
    logger.info('⏸️  Aguardando próximo ciclo agendado (não executa no startup)...');
    logger.info('⏰ Próxima execução em 3 horas');

    // Agendar ciclos a cada 3 horas
    setInterval(async () => {
      await this.processarCiclo();
    }, this.intervalo);

    logger.info('');
    logger.info('✅ Processador automático ativo');
  }

  /**
   * Para o processador
   */
  parar() {
    logger.info('🛑 Encerrando processador automático...');
    process.exit(0);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const processador = new ProcessadorLotesAutomatico();
  
  // Handlers para encerramento gracioso
  process.on('SIGINT', () => processador.parar());
  process.on('SIGTERM', () => processador.parar());
  
  processador.iniciar().catch((error) => {
    logger.error('Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = ProcessadorLotesAutomatico;
