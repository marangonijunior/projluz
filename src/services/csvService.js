const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const { Readable } = require('stream');
const logger = require('../utils/logger');

/**
 * Lê um arquivo CSV e retorna array de objetos
 * Normaliza nomes de colunas para formato padrão
 * @param {Buffer} csvBuffer - Buffer do arquivo CSV
 * @returns {Promise<Array>} - Array de objetos com dados do CSV
 */
async function parseCSV(csvBuffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(csvBuffer.toString());

    stream
      .pipe(csv({
        mapHeaders: ({ header }) => {
          // Normaliza nomes de colunas para formato padrão
          const normalized = header.trim().toLowerCase();
          if (normalized === 'id_prisma') return 'id';
          if (normalized === 'link_foto_plaqueta' || normalized === 'file_url') return 'file_url';
          return header;
        }
      }))
      .on('data', (data) => results.push(data))
      .on('end', () => {
        logger.info(`CSV parsed: ${results.length} linhas encontradas`);
        resolve(results);
      })
      .on('error', (error) => {
        logger.error('Erro ao fazer parse do CSV:', error);
        reject(error);
      });
  });
}

/**
 * Cria ou atualiza um arquivo CSV com resultado
 * @param {string} filePath - Caminho do arquivo
 * @param {Array} records - Array de registros para escrever
 * @param {boolean} append - Se true, adiciona ao final do arquivo
 * @returns {Promise<void>}
 */
async function writeCsv(filePath, records, append = false) {
  try {
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'id', title: 'id' },
        { id: 'file_id', title: 'file_id' },
        { id: 'numero_encontrado', title: 'numero_encontrado' },
        { id: 'confidencialidade', title: 'confidencialidade' },
        { id: 'falhou', title: 'falhou' }
      ],
      append
    });

    await csvWriter.writeRecords(records);
    logger.info(`CSV escrito: ${records.length} registro(s) em ${filePath}`);
  } catch (error) {
    logger.error('Erro ao escrever CSV:', error);
    throw error;
  }
}

/**
 * Adiciona uma linha ao arquivo CSV de resultado
 * @param {string} filePath - Caminho do arquivo
 * @param {object} record - Registro a ser adicionado
 * @returns {Promise<void>}
 */
async function appendCsvRecord(filePath, record) {
  const fs = require('fs');
  const fileExists = fs.existsSync(filePath);

  await writeCsv(filePath, [record], fileExists);
}

/**
 * Converte array de objetos em string CSV
 * @param {Array} records - Array de registros
 * @returns {string} - String CSV
 */
function arrayToCsvString(records) {
  if (!records || records.length === 0) {
    return 'id,link_foto_plaqueta,numero_encontrado,confidencialidade,falhou\n';
  }

  const headers = ['id', 'link_foto_plaqueta', 'numero_encontrado', 'confidencialidade', 'falhou'];
  const headerLine = headers.join(',');

  const dataLines = records.map(record => {
    return headers.map(header => {
      // Garante que todos os campos estão presentes
      let value = record[header];
      
      // Se o campo não existir mas for link_foto_plaqueta, tenta pegar de file_id
      if ((value === undefined || value === null || value === '') && header === 'link_foto_plaqueta') {
        value = record['file_url'] || record['file_id'] || '';
      }
      
      // Para numero_encontrado, SEMPRE trata como string para preservar zeros à esquerda
      if (header === 'numero_encontrado' && value) {
        value = String(value);
      } else {
        value = value ?? '';
      }
      
      // Escapa vírgulas e aspas
      if (String(value).includes(',') || String(value).includes('"')) {
        return `"${String(value).replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });

  return [headerLine, ...dataLines].join('\n');
}

/**
 * Lê arquivo CSV de resultado existente e retorna IDs processados
 * @param {Buffer} csvBuffer - Buffer do arquivo CSV
 * @returns {Promise<Set>} - Set com IDs já processados
 */
async function getProcessedIds(csvBuffer) {
  try {
    const records = await parseCSV(csvBuffer);
    const ids = new Set(records.map(record => String(record.id)));
    logger.info(`${ids.size} IDs já processados encontrados`);
    return ids;
  } catch (error) {
    logger.warn('Erro ao ler IDs processados (arquivo pode não existir ainda)');
    return new Set();
  }
}

/**
 * Cria registro de resultado para o CSV
 * IMPORTANTE: numero_encontrado é sempre STRING para preservar zeros à esquerda
 * Exemplo: "012345" não pode virar 12345
 * 
 * @param {string} id - ID do registro
 * @param {string} fileUrl - URL original do arquivo
 * @param {string} number - Número encontrado (SEMPRE STRING)
 * @param {number} confidence - Confiança
 * @param {boolean} failed - Se falhou
 * @returns {object} - Registro formatado
 */
function createResultRecord(id, fileUrl, number, confidence, failed) {
  return {
    id: String(id),
    link_foto_plaqueta: String(fileUrl),
    numero_encontrado: String(number || ''), // Força conversão para string
    confidencialidade: confidence || 0,
    falhou: failed ? 'true' : 'false'
  };
}

module.exports = {
  parseCSV,
  writeCsv,
  appendCsvRecord,
  arrayToCsvString,
  getProcessedIds,
  createResultRecord
};
