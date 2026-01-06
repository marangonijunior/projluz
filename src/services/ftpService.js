const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

/**
 * Conecta ao servidor FTP
 */
async function conectarFTP() {
  const client = new ftp.Client();
  client.ftp.verbose = process.env.FTP_VERBOSE === 'true';

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      port: parseInt(process.env.FTP_PORT || '21'),
      secure: process.env.FTP_SECURE === 'true', // true para FTPS
      secureOptions: {
        rejectUnauthorized: false // Permite certificados auto-assinados
      }
    });

    logger.debug(`Conectado ao FTP: ${process.env.FTP_HOST}`);
    return client;
  } catch (error) {
    logger.error('Erro ao conectar ao FTP:', error);
    throw error;
  }
}

/**
 * Lista arquivos CSV/XLSX em uma pasta do FTP
 */
async function listarArquivosCsv(pastaRemota = null) {
  const client = await conectarFTP();
  
  try {
    const pasta = pastaRemota || process.env.FTP_BASE_FOLDER || '/';
    logger.info(`Listando arquivos em: ${pasta}`);

    await client.cd(pasta);
    const arquivos = await client.list();
    
    // Filtrar apenas CSV e XLSX
    const csvXlsx = arquivos
      .filter(f => f.isFile && (f.name.endsWith('.csv') || f.name.endsWith('.xlsx')))
      .map(f => ({
        id: `${pasta}/${f.name}`, // Usar caminho completo como ID
        name: f.name,
        size: f.size,
        modifiedTime: f.modifiedAt || f.date || new Date().toISOString(),
        path: `${pasta}/${f.name}`
      }));

    logger.info(`Encontrados ${csvXlsx.length} arquivo(s) CSV/XLSX`);
    return csvXlsx;
  } catch (error) {
    logger.error('Erro ao listar arquivos FTP:', error);
    throw error;
  } finally {
    client.close();
  }
}

/**
 * Baixa um arquivo do FTP para um caminho local
 */
async function baixarArquivo(caminhoRemoto, caminhoLocal) {
  const client = await conectarFTP();
  
  try {
    logger.debug(`Baixando: ${caminhoRemoto} -> ${caminhoLocal}`);
    
    // Garantir que o diretório local existe
    const dir = path.dirname(caminhoLocal);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await client.downloadTo(caminhoLocal, caminhoRemoto);
    logger.debug(`Arquivo baixado: ${caminhoLocal}`);
    
    return caminhoLocal;
  } catch (error) {
    logger.error(`Erro ao baixar arquivo ${caminhoRemoto}:`, error);
    throw error;
  } finally {
    client.close();
  }
}

/**
 * Baixa conteúdo de um arquivo FTP como Buffer
 */
async function baixarArquivoBuffer(caminhoRemoto) {
  const tempPath = path.join('/tmp', `ftp_${Date.now()}_${path.basename(caminhoRemoto)}`);
  
  try {
    await baixarArquivo(caminhoRemoto, tempPath);
    const buffer = fs.readFileSync(tempPath);
    fs.unlinkSync(tempPath); // Limpar arquivo temp
    return buffer;
  } catch (error) {
    // Limpar arquivo temp em caso de erro
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

/**
 * Calcula hash SHA256 de um arquivo FTP (para detecção de duplicatas)
 */
async function calcularHashArquivo(caminhoRemoto) {
  const client = await conectarFTP();
  
  try {
    logger.debug(`Calculando hash de: ${caminhoRemoto}`);
    
    const hash = crypto.createHash('sha256');
    const tempPath = path.join('/tmp', `hash_${Date.now()}_${path.basename(caminhoRemoto)}`);
    
    // Baixar arquivo
    await client.downloadTo(tempPath, caminhoRemoto);
    
    // Calcular hash
    const buffer = fs.readFileSync(tempPath);
    hash.update(buffer);
    const hashHex = hash.digest('hex');
    
    // Limpar arquivo temp
    fs.unlinkSync(tempPath);
    
    logger.debug(`Hash calculado: ${hashHex.substring(0, 16)}...`);
    return hashHex;
  } catch (error) {
    logger.error(`Erro ao calcular hash de ${caminhoRemoto}:`, error);
    throw error;
  } finally {
    client.close();
  }
}

/**
 * Busca uma imagem no FTP (dentro da pasta do lote)
 * Estrutura esperada: /base_folder/lote_001/fotos/IMG001.jpg
 */
async function buscarImagem(nomeArquivo, pastaLote) {
  const client = await conectarFTP();
  
  try {
    // Tentar diferentes estruturas de pasta
    const possiveisCaminhos = [
      `${pastaLote}/fotos/${nomeArquivo}`,
      `${pastaLote}/${nomeArquivo}`,
      `${pastaLote}/images/${nomeArquivo}`,
      `${pastaLote}/photos/${nomeArquivo}`
    ];

    for (const caminho of possiveisCaminhos) {
      try {
        const tamanho = await client.size(caminho);
        if (tamanho > 0) {
          logger.debug(`Imagem encontrada: ${caminho}`);
          return caminho;
        }
      } catch (error) {
        // Arquivo não existe neste caminho, tentar próximo
        continue;
      }
    }

    logger.warn(`Imagem não encontrada: ${nomeArquivo} em ${pastaLote}`);
    return null;
  } catch (error) {
    logger.error(`Erro ao buscar imagem ${nomeArquivo}:`, error);
    return null;
  } finally {
    client.close();
  }
}

/**
 * Busca imagem no FTP usando caminho completo
 * Formato: "45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg"
 * 
 * @param {string} caminhoRelativo - Caminho relativo (pasta/arquivo.jpg)
 * @returns {string|null} Caminho completo no FTP ou null
 */
async function buscarImagemCaminhoCompleto(caminhoRelativo) {
  const client = await conectarFTP();
  const baseFolder = process.env.FTP_BASE_FOLDER || '/';
  
  try {
    // Normalizar caminho (remover barras duplas)
    const caminhoNormalizado = caminhoRelativo.replace(/^\/+/, '').replace(/\/+/g, '/');
    
    // Montar caminho completo
    const caminhoCompleto = `${baseFolder}/${caminhoNormalizado}`.replace(/\/+/g, '/');
    
    logger.debug(`Verificando: ${caminhoCompleto}`);
    
    // Verificar se arquivo existe
    const tamanho = await client.size(caminhoCompleto);
    
    if (tamanho > 0) {
      logger.debug(`✅ Imagem encontrada: ${caminhoCompleto} (${tamanho} bytes)`);
      return caminhoCompleto;
    } else {
      logger.warn(`⚠️ Arquivo vazio: ${caminhoCompleto}`);
      return null;
    }
  } catch (error) {
    logger.debug(`❌ Não encontrado: ${caminhoRelativo} - ${error.message}`);
    return null;
  } finally {
    client.close();
  }
}

/**
 * Baixa uma imagem do FTP para arquivo temporário
 */
async function baixarImagemTemp(caminhoRemoto) {
  const nomeTemp = `img_${Date.now()}_${path.basename(caminhoRemoto)}`;
  const caminhoLocal = path.join('/tmp', nomeTemp);
  
  try {
    await baixarArquivo(caminhoRemoto, caminhoLocal);
    return caminhoLocal;
  } catch (error) {
    logger.error(`Erro ao baixar imagem ${caminhoRemoto}:`, error);
    throw error;
  }
}

/**
 * Faz upload de um arquivo para o FTP
 */
async function uploadArquivo(caminhoLocal, caminhoRemoto) {
  const client = await conectarFTP();
  
  try {
    logger.debug(`Upload: ${caminhoLocal} -> ${caminhoRemoto}`);
    
    // Garantir que a pasta remota existe
    const dir = path.dirname(caminhoRemoto);
    try {
      await client.ensureDir(dir);
    } catch (error) {
      logger.warn(`Não foi possível criar diretório ${dir}:`, error.message);
    }

    await client.uploadFrom(caminhoLocal, caminhoRemoto);
    logger.debug(`Upload concluído: ${caminhoRemoto}`);
    
    return caminhoRemoto;
  } catch (error) {
    logger.error(`Erro ao fazer upload de ${caminhoLocal}:`, error);
    throw error;
  } finally {
    client.close();
  }
}

/**
 * Verifica se o serviço FTP está configurado e acessível
 */
async function verificarConexao() {
  try {
    if (!process.env.FTP_HOST) {
      throw new Error('FTP_HOST não configurado');
    }
    if (!process.env.FTP_USER) {
      throw new Error('FTP_USER não configurado');
    }
    if (!process.env.FTP_PASSWORD) {
      throw new Error('FTP_PASSWORD não configurado');
    }

    const client = await conectarFTP();
    
    // Testar listagem na pasta base
    const pasta = process.env.FTP_BASE_FOLDER || '/';
    await client.cd(pasta);
    
    client.close();
    
    logger.info('✅ Conexão FTP verificada com sucesso');
    return true;
  } catch (error) {
    logger.error('❌ Erro ao verificar conexão FTP:', error);
    throw error;
  }
}

module.exports = {
  conectarFTP,
  listarArquivosCsv,
  baixarArquivo,
  baixarArquivoBuffer,
  calcularHashArquivo,
  buscarImagem,
  buscarImagemCaminhoCompleto,
  baixarImagemTemp,
  uploadArquivo,
  verificarConexao
};
