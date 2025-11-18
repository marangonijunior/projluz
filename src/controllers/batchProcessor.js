const path = require('path');
const fs = require('fs');
const driveService = require('../services/driveService');
const rekognitionService = require('../services/rekognitionService');
const csvService = require('../services/csvService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { extractFileIdFromUrl } = require('../utils/fileNameExtractor');
const { validateCsvRow, validateResult } = require('../utils/validator');
const { config } = require('../config/aws');

/**
 * Processa um arquivo CSV completo
 * @param {object} csvFile - Objeto com id e nome do arquivo CSV
 * @returns {Promise<object>} - Estatísticas do processamento
 */
async function processCsvFile(csvFile) {
  const startTime = Date.now();
  const resultFileName = csvFile.name.replace('.csv', '_resultado.csv');
  
  let stats = {
    batchName: csvFile.name,
    total: 0,
    success: 0,
    failures: 0,
    duration: 0,
    timestamp: new Date().toLocaleString('pt-BR'),
    resultFileId: null,
    resultFileName: resultFileName
  };

  try {
    logger.logBatchStart(csvFile.name);

    // 1. Fazer download e parse do CSV
    const csvBuffer = await driveService.downloadFile(csvFile.id);
    const photos = await csvService.parseCSV(csvBuffer);

    if (!photos || photos.length === 0) {
      throw new Error('CSV vazio ou inválido');
    }

    logger.info(`📋 ${photos.length} fotos para processar`);

    // 2. Verificar se já existe arquivo de resultado (para recuperação)
    const resultFileName = csvFile.name.replace('.csv', '_resultado.csv');
    const existingResult = await driveService.findFile(resultFileName);
    let processedIds = new Set();

    if (existingResult) {
      logger.info('📄 Arquivo de resultado existente encontrado - recuperando progresso');
      const resultBuffer = await driveService.downloadFile(existingResult.id);
      processedIds = await csvService.getProcessedIds(resultBuffer);
    }

    // 3. Filtrar fotos já processadas
    const pendingPhotos = photos.filter(photo => !processedIds.has(String(photo.id)));
    
    if (pendingPhotos.length === 0) {
      logger.info('✅ Todas as fotos já foram processadas');
      stats.total = photos.length;
      stats.success = processedIds.size;
      stats.duration = (Date.now() - startTime) / 1000;
      return stats;
    }

    logger.info(`🔄 ${pendingPhotos.length} fotos pendentes (${processedIds.size} já processadas)`);

    // 4. Processar fotos uma por uma
    stats.total = photos.length;

    for (const photo of pendingPhotos) {
      try {
        await processPhoto(photo, resultFileName, stats);
      } catch (error) {
        logger.error(`Erro ao processar foto ${photo.id}:`, error);
        // Continua processando as próximas fotos
      }

      // Pequeno delay para não sobrecarregar as APIs
      await sleep(500);
    }

    // 5. Calcular duração
    stats.duration = (Date.now() - startTime) / 1000;

    // 6. Preparar caminho do arquivo de resultado local
    const resultsDir = path.join(__dirname, '../../results');
    const localFilePath = path.join(resultsDir, resultFileName);

    // 7. Enviar email com resumo e arquivo anexo
    logger.info('📧 Enviando email com resumo e arquivo anexado...');
    await emailService.sendSummaryEmail(stats, localFilePath);

    logger.logBatchEnd(csvFile.name, stats);

    return stats;

  } catch (error) {
    logger.error(`❌ Erro crítico ao processar ${csvFile.name}:`, error);
    
    // Enviar email de erro
    await emailService.sendErrorEmail(csvFile.name, error.message);
    
    throw error;
  }
}

/**
 * Processa uma foto individual
 * @param {object} photo - Objeto com id e file_url
 * @param {string} resultFileName - Nome do arquivo de resultado
 * @param {object} stats - Objeto de estatísticas (modificado por referência)
 */
async function processPhoto(photo, resultFileName, stats) {
  const photoId = photo.id;
  let fileId = '';
  let result = {
    number: '',
    confidence: 0,
    failed: true,
    reason: ''
  };

  try {
    // 1. Validar linha do CSV
    const validation = validateCsvRow(photo);
    if (!validation.isValid) {
      throw new Error(`CSV inválido: ${validation.errors.join(', ')}`);
    }

    // 2. Extrair File ID da URL
    fileId = extractFileIdFromUrl(photo.file_url);
    if (!fileId) {
      throw new Error('Não foi possível extrair File ID da URL');
    }

    logger.logPhotoProcessing(photoId, fileId);

    // 3. Fazer download da imagem
    logger.info(`⬇️  Fazendo download da imagem...`);
    const imageBuffer = await driveService.downloadImageFromUrl(photo.file_url);

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Erro ao fazer download da imagem');
    }

    logger.info(`✅ Imagem baixada: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

    // 4. Processar com AWS Rekognition
    const rekognitionResult = await rekognitionService.extractNumberFromImage(
      imageBuffer,
      config.digitLength
    );

    result.number = rekognitionResult.number;
    result.confidence = rekognitionResult.confidence;
    result.failed = !rekognitionResult.success;
    result.reason = rekognitionResult.reason;
    result.status = rekognitionResult.status; // 'sucesso', 'falha', 'warning'
    result.alternativeNumbers = rekognitionResult.alternativeNumbers || [];

    // 5. Validar resultado baseado no status retornado
    if (rekognitionResult.status === 'warning') {
      logger.warn(`⚠️  WARNING - Foto ${photoId}: ${rekognitionResult.reason}`);
      logger.warn(`   Números alternativos: ${rekognitionResult.alternativeNumbers.map(n => `${n.numero} (${n.confidencialidade}%)`).join(', ')}`);
      stats.failures++; // Contabiliza como falha até ser revisado
    } else if (rekognitionResult.status === 'sucesso') {
      logger.logPhotoSuccess(photoId, result.number, result.confidence);
      stats.success++;
    } else {
      logger.logPhotoFailure(photoId, result.reason);
      stats.failures++;
    }

  } catch (error) {
    logger.logPhotoFailure(photoId, error.message);
    result.failed = true;
    result.reason = error.message;
    stats.failures++;
  }

  // 6. Criar registro do resultado (usando URL original)
  const record = csvService.createResultRecord(
    photoId,
    photo.file_url,  // Passa a URL completa em vez do file_id
    result.number,
    result.confidence,
    result.failed
  );

  // 7. Atualizar CSV incrementalmente
  await updateResultCsv(resultFileName, record);
}

/**
 * Atualiza o arquivo de resultado (salva localmente)
 * @param {string} resultFileName - Nome do arquivo de resultado
 * @param {object} record - Registro a ser adicionado
 */
async function updateResultCsv(resultFileName, record) {
  try {
    const resultsDir = path.join(__dirname, '../../results');
    const localFilePath = path.join(resultsDir, resultFileName);
    
    // Criar diretório se não existir
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    let records = [record];

    // Verificar se arquivo local já existe
    if (fs.existsSync(localFilePath)) {
      const existingBuffer = fs.readFileSync(localFilePath);
      const existingRecords = await csvService.parseCSV(existingBuffer);
      records = [...existingRecords, record];
    }

    // Converter para string CSV
    const csvString = csvService.arrayToCsvString(records);

    // Salvar localmente
    fs.writeFileSync(localFilePath, csvString, 'utf8');
    
    logger.info(`📝 ${resultFileName} atualizado localmente (${records.length} registros)`);

  } catch (error) {
    logger.error('Erro ao atualizar arquivo de resultado:', error);
    throw error;
  }
}

/**
 * Encontra próximo CSV não processado
 * @returns {Promise<object|null>} - Objeto do CSV ou null
 */
async function findNextCsv() {
  try {
    const csvFiles = await driveService.listCsvFiles();

    if (!csvFiles || csvFiles.length === 0) {
      logger.info('Nenhum arquivo CSV encontrado');
      return null;
    }

    logger.info(`${csvFiles.length} arquivo(s) CSV encontrado(s)`);

    // Procurar primeiro CSV sem arquivo de resultado
    for (const csvFile of csvFiles) {
      const resultFile = await driveService.findResultCsv(csvFile.name);
      
      if (!resultFile) {
        logger.info(`📄 CSV não processado encontrado: ${csvFile.name}`);
        return csvFile;
      }
    }

    logger.info('Todos os CSVs já foram processados');
    return null;

  } catch (error) {
    logger.error('Erro ao buscar próximo CSV:', error);
    throw error;
  }
}

/**
 * Função auxiliar para delay
 * @param {number} ms - Milissegundos
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  processCsvFile,
  processPhoto,
  findNextCsv,
  updateResultCsv
};
