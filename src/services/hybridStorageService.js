/**
 * Serviço Híbrido de Storage
 * 
 * PLANILHAS (CSV/XLSX): Google Drive
 * FOTOS (JPG): FTP Server
 * 
 * Este serviço combina os dois sistemas:
 * - Lista e baixa planilhas do Google Drive
 * - Busca e baixa fotos do FTP usando caminho completo
 */

const logger = require('./logger');
const driveService = require('./driveService');
const ftpService = require('./ftpService');
const crypto = require('crypto');

/**
 * Lista arquivos CSV/XLSX do Google Drive
 * @param {string} folderId - ID da pasta no Google Drive
 * @returns {Array} Lista de arquivos filtrados (>= lote_100)
 */
async function listarPlanilhasDrive(folderId) {
  logger.info('📂 Listando planilhas do Google Drive...');
  
  try {
    const arquivos = await driveService.listCsvFiles(folderId);
    
    // Filtrar apenas lotes >= 100
    const arquivosFiltrados = arquivos.filter(arquivo => {
      const match = arquivo.name.match(/lote[_\s-]?(\d+)/i);
      if (match) {
        const numeroLote = parseInt(match[1], 10);
        return numeroLote >= 100;
      }
      return false; // Ignorar arquivos sem padrão lote_XXX
    });
    
    logger.info(`📊 Encontrados ${arquivosFiltrados.length} planilhas válidas (>= lote_100)`);
    logger.debug(`Total no Drive: ${arquivos.length}, Filtrados: ${arquivosFiltrados.length}`);
    
    return arquivosFiltrados;
  } catch (error) {
    logger.error('Erro ao listar planilhas do Drive:', error);
    throw error;
  }
}

/**
 * Baixa planilha do Google Drive como Buffer
 * @param {string} fileId - ID do arquivo no Drive
 * @returns {Buffer} Conteúdo do arquivo
 */
async function baixarPlanilhaDrive(fileId) {
  logger.debug(`Baixando planilha do Drive: ${fileId}`);
  return await driveService.downloadFile(fileId);
}

/**
 * Calcula hash SHA256 de uma planilha no Drive
 * @param {string} fileId - ID do arquivo no Drive
 * @returns {string} Hash SHA256 do arquivo
 */
async function calcularHashPlanilha(fileId) {
  logger.debug(`Calculando hash de planilha: ${fileId}`);
  return await driveService.calcularHashArquivo(fileId);
}

/**
 * Normaliza link da foto removendo domínio/protocolo e caminho Windows
 * 
 * Aceita:
 * - "https://prisma-ftp.perfilrk.com.br/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg"
 * - "G:\Rio de Janeiro\...\141_PAVUNA/arquivo.jpg"
 * - "45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg"
 * 
 * Retorna: "45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg"
 * 
 * @param {string} link - Link completo ou caminho relativo
 * @returns {string} Caminho relativo normalizado
 */
function normalizarLinkFoto(link) {
  if (!link) return '';
  
  let caminho = link;
  
  // Se for URL completa (http:// ou https://)
  if (caminho.match(/^https?:\/\//i)) {
    try {
      const url = new URL(caminho);
      // Pegar pathname e remover primeira barra
      caminho = url.pathname.replace(/^\/+/, '');
    } catch (error) {
      logger.warn(`Erro ao parsear URL: ${link}`);
      // Fallback: remover manualmente
      caminho = caminho.replace(/^https?:\/\/[^\/]+\//i, '');
    }
  }
  // Se for caminho Windows (G:\...), pegar apenas pasta final + arquivo
  else if (caminho.match(/^[A-Z]:\\/)) {
    // "G:\Rio de Janeiro\...\141_PAVUNA\arquivo.jpg" -> "141_PAVUNA/arquivo.jpg"
    const partes = caminho.split(/[\\\/]/);
    caminho = partes.slice(-2).join('/');
  }
  
  // Normalizar barras e remover barra inicial
  caminho = caminho.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  
  return caminho;
}

/**
 * Busca foto no FTP usando caminho completo
 * 
 * Aceita URLs completas ou caminhos relativos:
 * - "https://prisma-ftp.perfilrk.com.br/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg"
 * - "45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg"
 * 
 * @param {string} linkFoto - Link da foto (URL ou caminho)
 * @returns {string|null} Caminho completo no FTP ou null se não encontrado
 */
async function buscarFotoFtp(linkFoto) {
  const baseFolder = process.env.FTP_BASE_FOLDER || '/';
  
  // Normalizar link (remover domínio se for URL)
  const caminhoRelativo = normalizarLinkFoto(linkFoto);
  
  if (!caminhoRelativo) {
    logger.warn('Link de foto vazio ou inválido');
    return null;
  }
  
  // Montar caminho completo no FTP
  const caminhoFTP = `${baseFolder}/${caminhoRelativo}`.replace(/\/+/g, '/');
  
  logger.debug(`Buscando foto no FTP: ${caminhoFTP}`);
  
  try {
    const client = await ftpService.conectarFTP();
    
    // Verificar se arquivo existe
    const tamanho = await client.size(caminhoFTP);
    client.close();
    
    if (tamanho > 0) {
      logger.debug(`✅ Foto encontrada: ${caminhoFTP} (${tamanho} bytes)`);
      return caminhoFTP;
    } else {
      logger.warn(`❌ Foto não encontrada ou vazia: ${caminhoFTP}`);
      return null;
    }
  } catch (error) {
    logger.warn(`❌ Foto não acessível: ${caminhoFTP} - ${error.message}`);
    return null;
  }
}

/**
 * Baixa foto do FTP para arquivo temporário
 * @param {string} caminhoFTP - Caminho completo no FTP
 * @returns {string} Caminho do arquivo temporário local
 */
async function baixarFotoTemp(caminhoFTP) {
  logger.debug(`Baixando foto do FTP: ${caminhoFTP}`);
  return await ftpService.baixarImagemTemp(caminhoFTP);
}

/**
 * Verifica conexão com ambos os serviços (Drive + FTP)
 */
async function verificarConexaoHibrida() {
  logger.info('🔍 Verificando conexão híbrida (Drive + FTP)...\n');
  
  // Verificar Google Drive
  logger.info('1️⃣  Testando Google Drive...');
  try {
    const folderId = process.env.FOLDER_ID;
    if (!folderId) {
      throw new Error('FOLDER_ID não definido no .env');
    }
    
    const arquivos = await driveService.listCsvFiles(folderId);
    logger.info(`✅ Google Drive OK: ${arquivos.length} arquivo(s) encontrado(s)`);
  } catch (error) {
    logger.error(`❌ Google Drive FALHOU: ${error.message}`);
    throw error;
  }
  
  // Verificar FTP
  logger.info('\n2️⃣  Testando FTP Server...');
  try {
    await ftpService.verificarConexao();
    logger.info('✅ FTP Server OK');
  } catch (error) {
    logger.error(`❌ FTP Server FALHOU: ${error.message}`);
    throw error;
  }
  
  logger.info('\n✅ Conexão híbrida verificada com sucesso!\n');
}

/**
 * Retorna informações sobre a configuração híbrida
 */
function getConfigInfo() {
  return {
    modo: 'HÍBRIDO',
    planilhas: {
      tipo: 'Google Drive',
      folderId: process.env.FOLDER_ID || 'não configurado',
      filtro: 'lotes >= 50'
    },
    fotos: {
      tipo: 'FTP Server',
      host: process.env.FTP_HOST || 'não configurado',
      baseFolder: process.env.FTP_BASE_FOLDER || '/',
      formato: 'pasta/arquivo.jpg (ex: 45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg)'
    }
  };
}

module.exports = {
  // Planilhas (Google Drive)
  listarPlanilhasDrive,
  baixarPlanilhaDrive,
  calcularHashPlanilha,
  
  // Fotos (FTP)
  normalizarLinkFoto,
  buscarFotoFtp,
  baixarFotoTemp,
  
  // Utilitários
  verificarConexaoHibrida,
  getConfigInfo
};
