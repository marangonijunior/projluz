/**
 * Valida se um número tem exatamente N dígitos
 * @param {string} number - Número a validar
 * @param {number} length - Quantidade de dígitos esperados
 * @returns {boolean} - true se válido
 */
function isValidDigitLength(number, length = 6) {
  if (!number || typeof number !== 'string') {
    return false;
  }

  // Remove caracteres não numéricos
  const cleanNumber = number.replace(/\D/g, '');
  
  return cleanNumber.length === length;
}

/**
 * Valida se a confiança está acima do mínimo
 * @param {number} confidence - Percentual de confiança
 * @param {number} minConfidence - Confiança mínima (padrão: 95)
 * @returns {boolean} - true se válido
 */
function isValidConfidence(confidence, minConfidence = 95) {
  return typeof confidence === 'number' && confidence >= minConfidence;
}

/**
 * Valida resultado do processamento
 * @param {string} number - Número encontrado
 * @param {number} confidence - Confiança
 * @param {number} minConfidence - Confiança mínima
 * @param {number} digitLength - Quantidade de dígitos
 * @returns {object} - { isValid, reason }
 */
function validateResult(number, confidence, minConfidence = 95, digitLength = 6) {
  if (!isValidConfidence(confidence, minConfidence)) {
    return {
      isValid: false,
      reason: `Confiança abaixo do mínimo (${confidence}% < ${minConfidence}%)`
    };
  }

  if (!isValidDigitLength(number, digitLength)) {
    const actualLength = number ? number.replace(/\D/g, '').length : 0;
    return {
      isValid: false,
      reason: `Número com ${actualLength} dígitos (esperado: ${digitLength})`
    };
  }

  return {
    isValid: true,
    reason: 'Validação aprovada'
  };
}

/**
 * Extrai apenas números de uma string
 * IMPORTANTE: Retorna STRING para preservar zeros à esquerda
 * Exemplo: "ABC 012345 DEF" → "012345" (não "12345")
 * 
 * @param {string} text - Texto contendo números
 * @returns {string} - Apenas dígitos (como STRING)
 */
function extractDigits(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove tudo que não é dígito, mas mantém como string
  const digits = text.replace(/\D/g, '');
  return digits; // Retorna como string para preservar zeros à esquerda
}

/**
 * Valida formato de URL do Google Drive
 * @param {string} url - URL a validar
 * @returns {boolean} - true se válido
 */
function isValidGoogleDriveUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const patterns = [
    /drive\.usercontent\.google\.com\/download\?id=([^&]+)/,
    /drive\.google\.com\/file\/d\/([^\/]+)/
  ];

  return patterns.some(pattern => pattern.test(url));
}

/**
 * Valida estrutura do CSV de entrada
 * @param {object} row - Linha do CSV
 * @returns {object} - { isValid, errors }
 */
function validateCsvRow(row) {
  const errors = [];

  if (!row.id) {
    errors.push('Campo "id" ausente');
  }

  if (!row.file_url) {
    errors.push('Campo "file_url" ausente');
  } else if (!isValidGoogleDriveUrl(row.file_url)) {
    errors.push('URL do Google Drive inválida');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  isValidDigitLength,
  isValidConfidence,
  validateResult,
  extractDigits,
  isValidGoogleDriveUrl,
  validateCsvRow
};
