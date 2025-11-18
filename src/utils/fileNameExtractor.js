/**
 * Extrai o File ID de uma URL do Google Drive
 * @param {string} url - URL do Google Drive
 * @returns {string|null} - File ID extraído ou null
 */
function extractFileIdFromUrl(url) {
  try {
    // Padrão: https://drive.usercontent.google.com/download?id=FILE_ID&authuser=0
    const match = url.match(/[?&]id=([^&]+)/);
    
    if (match && match[1]) {
      return match[1];
    }

    // Também suporta URLs diretas como: https://drive.google.com/file/d/FILE_ID/view
    const directMatch = url.match(/\/d\/([^\/]+)/);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }

    return null;
  } catch (error) {
    console.error('Erro ao extrair File ID:', error);
    return null;
  }
}

/**
 * Gera nome de arquivo temporário baseado no File ID
 * @param {string} fileId - ID do arquivo
 * @param {string} extension - Extensão do arquivo (padrão: jpg)
 * @returns {string} - Nome do arquivo
 */
function getFileNameFromId(fileId, extension = 'jpg') {
  const cleanExtension = extension.replace('.', '').toLowerCase();
  return `${fileId}.${cleanExtension}`;
}

/**
 * Valida se a extensão do arquivo é suportada
 * @param {string} fileName - Nome do arquivo
 * @returns {boolean} - true se suportado
 */
function isValidImageExtension(fileName) {
  const validExtensions = ['.jpg', '.jpeg', '.png'];
  const lowerFileName = fileName.toLowerCase();
  
  return validExtensions.some(ext => lowerFileName.endsWith(ext));
}

/**
 * Extrai extensão de um nome de arquivo ou URL
 * @param {string} fileNameOrUrl - Nome do arquivo ou URL
 * @returns {string} - Extensão (ex: 'jpg', 'png')
 */
function extractExtension(fileNameOrUrl) {
  try {
    // Remove query strings
    const cleanPath = fileNameOrUrl.split('?')[0];
    
    // Extrai extensão
    const match = cleanPath.match(/\.([^.]+)$/);
    
    if (match && match[1]) {
      const ext = match[1].toLowerCase();
      if (['jpg', 'jpeg', 'png'].includes(ext)) {
        return ext;
      }
    }
    
    // Padrão para jpg
    return 'jpg';
  } catch (error) {
    return 'jpg';
  }
}

module.exports = {
  extractFileIdFromUrl,
  getFileNameFromId,
  isValidImageExtension,
  extractExtension
};
