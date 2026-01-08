const axios = require('axios');
const logger = require('./logger');

/**
 * Baixa arquivo via HTTP e retorna como Buffer
 * @param {string} url - URL completa do arquivo
 * @returns {Promise<Buffer>} - Buffer com o conteúdo do arquivo
 */
async function baixarArquivoHTTP(url) {
  try {
    logger.debug(`📥 Baixando arquivo via HTTP: ${url}`);
    
    // Configurar autenticação HTTP Basic (se disponível)
    const config = {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 segundos
      maxContentLength: 50 * 1024 * 1024, // 50MB max
      validateStatus: (status) => status === 200
    };
    
    // Adicionar credenciais se configuradas
    if (process.env.HTTP_USERNAME && process.env.HTTP_PASSWORD) {
      config.auth = {
        username: process.env.HTTP_USERNAME,
        password: process.env.HTTP_PASSWORD
      };
    }
    
    const response = await axios.get(url, config);
    
    const buffer = Buffer.from(response.data);
    logger.debug(`✅ Download concluído: ${(buffer.length / 1024).toFixed(1)}KB`);
    
    return buffer;
  } catch (error) {
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${error.response.statusText} - ${url}`);
    } else if (error.code === 'ECONNABORTED') {
      throw new Error(`Timeout ao baixar arquivo: ${url}`);
    } else {
      throw new Error(`Erro ao baixar arquivo via HTTP: ${error.message}`);
    }
  }
}

module.exports = {
  baixarArquivoHTTP
};
