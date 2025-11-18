const { rekognition, config } = require('../config/aws');
const logger = require('../utils/logger');
const { extractDigits } = require('../utils/validator');

/**
 * Detecta texto em uma imagem usando AWS Rekognition
 * @param {Buffer} imageBuffer - Buffer da imagem
 * @returns {Array} - Lista de textos detectados com confiança
 */
async function detectText(imageBuffer) {
  try {
    const params = {
      Image: {
        Bytes: imageBuffer
      }
    };

    const result = await rekognition.detectText(params).promise();
    
    return result.TextDetections || [];
  } catch (error) {
    logger.error('Erro ao chamar AWS Rekognition:', error);
    throw error;
  }
}

/**
 * Procura por números de N dígitos nos textos detectados
 * Retorna TODOS os números com exatamente N dígitos encontrados
 * IMPORTANTE: Preserva zeros à esquerda retornando como STRING
 * 
 * @param {Array} textDetections - Lista de textos detectados
 * @param {number} digitLength - Quantidade de dígitos esperados
 * @returns {Array} - Array de { text: string, confidence: number }
 */
function findAllNumbersWithDigits(textDetections, digitLength = 6) {
  try {
    const results = [];
    
    // Filtra apenas detecções do tipo LINE (linhas de texto)
    const lineDetections = textDetections.filter(
      detection => detection.Type === 'LINE'
    );

    // Procura por TODOS os números com exatamente N dígitos
    for (const detection of lineDetections) {
      const text = detection.DetectedText || '';
      const digits = extractDigits(text); // Retorna STRING

      // Verifica se encontrou número com quantidade correta de dígitos
      if (digits.length === digitLength) {
        results.push({
          text: String(digits), // Garante que é STRING para preservar zeros
          confidence: parseFloat(detection.Confidence.toFixed(2))
        });
      }
    }

    return results;
  } catch (error) {
    logger.error('Erro ao processar detecções de texto:', error);
    return [];
  }
}

/**
 * Procura por um número de N dígitos nos textos detectados
 * @param {Array} textDetections - Lista de textos detectados
 * @param {number} digitLength - Quantidade de dígitos esperados
 * @returns {object|null} - { text, confidence } ou null
 */
function findNumberWithDigits(textDetections, digitLength = 6) {
  try {
    const allNumbers = findAllNumbersWithDigits(textDetections, digitLength);
    
    if (allNumbers.length > 0) {
      // Retorna o primeiro número encontrado (maior confiança)
      return allNumbers.sort((a, b) => b.confidence - a.confidence)[0];
    }

    return null;
  } catch (error) {
    logger.error('Erro ao processar detecções de texto:', error);
    return null;
  }
}

/**
 * Processa uma imagem e extrai número de N dígitos
 * Aplica regras de validação:
 * - Se encontrar número com < 6 dígitos: IGNORAR
 * - Se não encontrar número com 6 dígitos: FALHA
 * - Se encontrar múltiplos números com 6 dígitos: WARNING (requer revisão)
 * - Se encontrar 1 número com 6 dígitos: SUCESSO
 * 
 * @param {Buffer} imageBuffer - Buffer da imagem
 * @param {number} digitLength - Quantidade de dígitos esperados (padrão: 6)
 * @returns {object} - { number, confidence, success, status, reason, alternativeNumbers }
 */
async function extractNumberFromImage(imageBuffer, digitLength = 6) {
  try {
    logger.info('Enviando imagem para AWS Rekognition...');
    
    const textDetections = await detectText(imageBuffer);
    
    if (!textDetections || textDetections.length === 0) {
      return {
        number: '',
        confidence: 0,
        success: false,
        status: 'falha',
        reason: 'Nenhum texto detectado na imagem',
        alternativeNumbers: []
      };
    }

    logger.info(`${textDetections.length} textos detectados`);

    // Busca TODOS os números com exatamente N dígitos
    const allNumbers = findAllNumbersWithDigits(textDetections, digitLength);

    // REGRA 1: Não encontrou nenhum número com 6 dígitos = FALHA
    if (allNumbers.length === 0) {
      // Verifica se encontrou números com outros tamanhos (para log)
      const lineDetections = textDetections.filter(d => d.Type === 'LINE');
      const otherNumbers = [];
      
      for (const detection of lineDetections) {
        const text = detection.DetectedText || '';
        const digits = extractDigits(text);
        if (digits.length > 0 && digits.length !== digitLength) {
          otherNumbers.push(`${digits} (${digits.length} dígitos)`);
        }
      }

      const reasonDetail = otherNumbers.length > 0
        ? `Apenas números com tamanho diferente de ${digitLength}: ${otherNumbers.join(', ')}`
        : `Nenhum número com ${digitLength} dígitos encontrado`;

      return {
        number: '',
        confidence: 0,
        success: false,
        status: 'falha',
        reason: reasonDetail,
        alternativeNumbers: []
      };
    }

    // REGRA 2: Encontrou exatamente 1 número com 6 dígitos = SUCESSO (se confiança OK)
    if (allNumbers.length === 1) {
      const result = allNumbers[0];
      const meetsConfidence = result.confidence >= config.minConfidence;

      if (meetsConfidence) {
        return {
          number: String(result.text), // SEMPRE STRING para preservar zeros
          confidence: result.confidence,
          success: true,
          status: 'sucesso',
          reason: 'Número único encontrado com confiança adequada',
          alternativeNumbers: []
        };
      } else {
        return {
          number: String(result.text), // SEMPRE STRING
          confidence: result.confidence,
          success: false,
          status: 'falha',
          reason: `Confiança baixa: ${result.confidence}% (mínimo: ${config.minConfidence}%)`,
          alternativeNumbers: []
        };
      }
    }

    // REGRA 3: Encontrou MÚLTIPLOS números com 6 dígitos = WARNING (requer revisão manual)
    if (allNumbers.length > 1) {
      // Ordena por confiança (maior primeiro)
      const sorted = allNumbers.sort((a, b) => b.confidence - a.confidence);
      const principal = sorted[0];
      const alternatives = sorted.slice(1);

      return {
        number: String(principal.text), // SEMPRE STRING para preservar zeros
        confidence: principal.confidence,
        success: false,
        status: 'warning',
        reason: `ATENÇÃO: ${allNumbers.length} números encontrados. Requer revisão manual.`,
        alternativeNumbers: alternatives.map(n => ({
          numero: String(n.text), // SEMPRE STRING para alternativas também
          confidencialidade: n.confidence
        }))
      };
    }

    // Fallback (não deveria chegar aqui)
    return {
      number: '',
      confidence: 0,
      success: false,
      status: 'falha',
      reason: 'Erro inesperado no processamento',
      alternativeNumbers: []
    };
    
  } catch (error) {
    logger.error('Erro ao processar imagem:', error);
    
    return {
      number: '',
      confidence: 0,
      success: false,
      status: 'falha',
      reason: `Erro no processamento: ${error.message}`,
      alternativeNumbers: []
    };
  }
}

module.exports = {
  detectText,
  findNumberWithDigits,
  findAllNumbersWithDigits,
  extractNumberFromImage
};
