const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getDriveInstance, FOLDER_ID } = require('../config/google-drive');
const logger = require('../utils/logger');

/**
 * Lista todos os arquivos CSV ou XLSX na pasta principal
 * @returns {Array} - Lista de objetos com id, nome e tipo dos arquivos
 */
async function listCsvFiles() {
  try {
    const drive = await getDriveInstance();
    
    // Lista arquivos CSV ou XLSX
    const response = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and (mimeType='text/csv' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') and trashed=false and not name contains '_resultado'`,
      fields: 'files(id, name, mimeType, createdTime)',
      orderBy: 'createdTime asc'
    });

    return response.data.files || [];
  } catch (error) {
    logger.error('Erro ao listar arquivos CSV/XLSX:', error);
    throw error;
  }
}

/**
 * Verifica se existe arquivo de resultado para um CSV
 * @param {string} csvFileName - Nome do CSV (ex: lote_001.csv)
 * @returns {Promise<object|null>} - Objeto com id e nome do arquivo de resultado ou null
 */
async function findResultCsv(csvFileName) {
  try {
    const drive = await getDriveInstance();
    
    // Remove extensão e adiciona _resultado
    const baseName = csvFileName.replace('.csv', '');
    const resultFileName = `${baseName}_resultado.csv`;
    
    const response = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name='${resultFileName}' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 1
    });

    const files = response.data.files || [];
    return files.length > 0 ? files[0] : null;
  } catch (error) {
    logger.error(`Erro ao buscar arquivo de resultado para ${csvFileName}:`, error);
    throw error;
  }
}

/**
 * Faz download de um arquivo do Google Drive
 * @param {string} fileId - ID do arquivo no Drive
 * @returns {Buffer} - Conteúdo do arquivo
 */
async function downloadFile(fileId) {
  try {
    const drive = await getDriveInstance();
    
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(response.data);
  } catch (error) {
    logger.error(`Erro ao fazer download do arquivo ${fileId}:`, error);
    throw error;
  }
}

/**
 * Faz download de uma imagem via URL direta
 * @param {string} url - URL direta do Google Drive
 * @returns {Buffer} - Conteúdo da imagem
 */
async function downloadImageFromUrl(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000 // 30 segundos
    });

    return Buffer.from(response.data);
  } catch (error) {
    logger.error(`Erro ao fazer download da imagem via URL:`, error);
    throw error;
  }
}

/**
 * Faz upload de um arquivo para o Google Drive
 * @param {string} fileName - Nome do arquivo
 * @param {Buffer|string} content - Conteúdo do arquivo
 * @param {string} mimeType - Tipo MIME do arquivo
 * @returns {object} - Objeto com id e nome do arquivo criado
 */
async function uploadFile(fileName, content, mimeType = 'text/csv') {
  try {
    const drive = await getDriveInstance();
    
    // Verifica se já existe um arquivo com esse nome
    const existing = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name='${fileName}' and trashed=false`,
      fields: 'files(id)',
      pageSize: 1
    });

    let fileId;

    if (existing.data.files && existing.data.files.length > 0) {
      // Atualiza arquivo existente
      fileId = existing.data.files[0].id;
      
      await drive.files.update({
        fileId,
        media: {
          mimeType,
          body: typeof content === 'string' ? content : Buffer.from(content)
        }
      });

      logger.info(`Arquivo ${fileName} atualizado no Drive`);
    } else {
      // Cria novo arquivo
      const response = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [FOLDER_ID]
        },
        media: {
          mimeType,
          body: typeof content === 'string' ? content : Buffer.from(content)
        },
        fields: 'id, name'
      });

      fileId = response.data.id;
      logger.info(`Arquivo ${fileName} criado no Drive`);
    }

    return { id: fileId, name: fileName };
  } catch (error) {
    logger.error(`Erro ao fazer upload do arquivo ${fileName}:`, error);
    throw error;
  }
}

/**
 * Verifica se um arquivo existe na pasta principal
 * @param {string} fileName - Nome do arquivo
 * @returns {object|null} - Objeto com id e nome do arquivo ou null
 */
async function findFile(fileName) {
  try {
    const drive = await getDriveInstance();
    
    const response = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name='${fileName}' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 1
    });

    const files = response.data.files || [];
    return files.length > 0 ? files[0] : null;
  } catch (error) {
    logger.error(`Erro ao buscar arquivo ${fileName}:`, error);
    throw error;
  }
}

module.exports = {
  listCsvFiles,
  findResultCsv,
  downloadFile,
  downloadImageFromUrl,
  uploadFile,
  findFile
};
