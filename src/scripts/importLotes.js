const crypto = require('crypto');
const { google } = require('googleapis');
const xlsx = require('xlsx');
const Lote = require('../models/Lote');
const Foto = require('../models/Foto');
const { connectDatabase } = require('../config/database');
const logger = require('../services/logger');

// Configurar Google Drive API
const auth = new google.auth.GoogleAuth({
  credentials: {
    type: process.env.GOOGLE_TYPE,
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI,
    token_uri: process.env.GOOGLE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL
  },
  scopes: ['https://www.googleapis.com/auth/drive.readonly']
});

const drive = google.drive({ version: 'v3', auth });

/**
 * Calcula hash SHA256 de uma string
 */
function calcularHash(conteudo) {
  return crypto.createHash('sha256').update(conteudo).digest('hex');
}

/**
 * Baixa e calcula hash de um arquivo do Google Drive
 */
async function calcularHashArquivo(fileId) {
  try {
    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, { responseType: 'stream' });
    
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      response.data
        .on('data', chunk => hash.update(chunk))
        .on('end', () => resolve(hash.digest('hex')))
        .on('error', reject);
    });
  } catch (error) {
    logger.error(`Erro ao calcular hash do arquivo ${fileId}:`, error);
    throw error;
  }
}

/**
 * Lista arquivos CSV e XLSX no folder do Google Drive
 */
async function listarCsvsDrive(folderId) {
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and (mimeType='text/csv' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') and trashed=false`,
      fields: 'files(id, name, size, modifiedTime)',
      orderBy: 'modifiedTime desc'
    });
    
    return response.data.files;
  } catch (error) {
    logger.error('Erro ao listar arquivos do Drive:', error);
    throw error;
  }
}

/**
 * Baixa conteúdo de um arquivo do Drive
 */
async function baixarArquivoDrive(fileId) {
  try {
    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, { responseType: 'arraybuffer' });
    
    return Buffer.from(response.data);
  } catch (error) {
    logger.error(`Erro ao baixar arquivo ${fileId}:`, error);
    throw error;
  }
}

/**
 * Parseia arquivo CSV ou XLSX e retorna array de objetos
 */
function parseArquivo(buffer, fileName) {
  try {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Converter para JSON mantendo strings (preserva zeros à esquerda)
    const dados = xlsx.utils.sheet_to_json(sheet, { 
      raw: false,  // Não converter para números
      defval: ''   // Valor padrão para células vazias
    });
    
    return dados;
  } catch (error) {
    logger.error(`Erro ao parsear arquivo ${fileName}:`, error);
    throw error;
  }
}

/**
 * Importa um lote do Google Drive
 */
async function importarLote(fileId, fileName) {
  const inicioImport = Date.now();
  logger.info(`Iniciando importação do lote: ${fileName}`);
  
  try {
    // Calcular hash do arquivo
    const hashArquivo = await calcularHashArquivo(fileId);
    
    // Verificar se já existe lote com este hash
    const loteExistente = await Lote.findOne({ hashArquivo });
    if (loteExistente) {
      logger.warn(`Lote ${fileName} já foi importado anteriormente (hash: ${hashArquivo})`);
      return {
        sucesso: false,
        motivo: 'duplicado',
        loteExistente: loteExistente.nome
      };
    }
    
    // Baixar e parsear arquivo (CSV ou XLSX)
    const bufferArquivo = await baixarArquivoDrive(fileId);
    const dadosArquivo = parseArquivo(bufferArquivo, fileName);
    
    if (dadosArquivo.length === 0) {
      throw new Error('Arquivo vazio ou inválido');
    }
    
    // Criar lote
    const nomeLote = fileName.replace(/\.(csv|xlsx)$/i, '');
    const lote = new Lote({
      nome: nomeLote,
      driveFileId: fileId,
      driveFileName: fileName,
      hashArquivo,
      totalFotos: dadosArquivo.length,
      fotosImportadas: 0,
      fotosPendentes: dadosArquivo.length,
      custoEstimadoAWS: dadosArquivo.length * 0.001,
      status: 'importando'
    });
    
    await lote.save();
    logger.info(`Lote criado: ${lote._id}`);
    
    // Importar fotos em lotes de 100
    const BATCH_SIZE = 100;
    let fotosImportadas = 0;
    let fotosDuplicadas = 0;
    
    for (let i = 0; i < dadosArquivo.length; i += BATCH_SIZE) {
      const batch = dadosArquivo.slice(i, i + BATCH_SIZE);
      const fotos = [];
      
      for (const linha of batch) {
        const idPrisma = linha.id_prisma || linha.idPrisma || '';
        const linkFoto = linha.link_foto_plaqueta || linha.linkFotoPlaqueta || '';
        
        if (!idPrisma || !linkFoto) {
          logger.warn(`Linha inválida ignorada: ${JSON.stringify(linha)}`);
          continue;
        }
        
        // Calcular hash da foto (URL + ID)
        const hashFoto = calcularHash(`${idPrisma}:${linkFoto}`);
        
        // Verificar duplicidade
        const fotoExistente = await Foto.findOne({ hashFoto });
        if (fotoExistente) {
          fotosDuplicadas++;
          logger.debug(`Foto duplicada ignorada: ${idPrisma}`);
          continue;
        }
        
        fotos.push({
          loteId: lote._id,
          loteNome: nomeLote,
          idPrisma,
          linkFotoOriginal: linkFoto,
          hashFoto,
          status: 'pendente'
        });
      }
      
      if (fotos.length > 0) {
        try {
          await Foto.insertMany(fotos, { ordered: false });
          fotosImportadas += fotos.length;
        } catch (error) {
          // Se houver erro de duplicata, contar quantas foram inseridas
          if (error.code === 11000 && error.writeErrors) {
            const inseridas = fotos.length - error.writeErrors.length;
            fotosImportadas += inseridas;
            fotosDuplicadas += error.writeErrors.length;
            logger.debug(`Batch ${i / BATCH_SIZE + 1}: ${inseridas} inseridas, ${error.writeErrors.length} duplicadas`);
          } else {
            throw error;
          }
        }
        
        // Atualizar progresso do lote
        lote.fotosImportadas = fotosImportadas;
        await lote.save();
        
        logger.info(`Batch ${i / BATCH_SIZE + 1}: ${fotos.length} fotos processadas`);
      }
    }
    
    // Finalizar importação
    lote.status = 'pendente';
    lote.fotosImportadas = fotosImportadas;
    lote.totalFotos = fotosImportadas;
    lote.fotosPendentes = fotosImportadas;
    
    if (fotosDuplicadas > 0) {
      lote.erros.push({
        mensagem: `${fotosDuplicadas} fotos duplicadas foram ignoradas`,
        tipo: 'aviso'
      });
    }
    
    await lote.save();
    
    const tempoTotal = Date.now() - inicioImport;
    logger.info(`Lote ${nomeLote} importado com sucesso!`);
    logger.info(`Total: ${fotosImportadas} fotos em ${(tempoTotal / 1000).toFixed(2)}s`);
    logger.info(`Duplicadas: ${fotosDuplicadas}`);
    
    return {
      sucesso: true,
      lote: {
        id: lote._id,
        nome: lote.nome,
        totalFotos: lote.totalFotos,
        fotosImportadas: lote.fotosImportadas,
        duplicadas: fotosDuplicadas
      },
      tempoImportacao: tempoTotal
    };
    
  } catch (error) {
    logger.error(`Erro ao importar lote ${fileName}:`, error);
    throw error;
  }
}

/**
 * Importa todos os arquivos (CSV/XLSX) de uma pasta do Drive
 */
async function importarTodosLotes(folderId = null) {
  logger.info('Iniciando importação de lotes...');
  
  try {
    const folder = folderId || process.env.FOLDER_ID;
    if (!folder) {
      throw new Error('FOLDER_ID não definido');
    }

    const arquivos = await listarCsvsDrive(folder);
    logger.info(`Encontrados ${arquivos.length} arquivo(s)`);
    
    if (arquivos.length === 0) {
      return {
        sucesso: 0,
        duplicados: 0,
        erros: 0,
        detalhes: []
      };
    }

    const resultados = [];
    let sucessos = 0;
    let duplicados = 0;
    let erros = 0;
    
    for (const arquivo of arquivos) {
      try {
        const resultado = await importarLote(arquivo.id, arquivo.name);
        
        if (resultado.sucesso) {
          sucessos++;
          logger.info(`✅ ${arquivo.name}: ${resultado.lote.totalFotos} fotos`);
        } else if (resultado.motivo === 'duplicado') {
          duplicados++;
          logger.info(`⏭️  ${arquivo.name}: duplicado`);
        } else {
          erros++;
          logger.error(`❌ ${arquivo.name}: ${resultado.motivo || 'erro desconhecido'}`);
        }
        
        resultados.push(resultado);
        
        // Aguardar 1 segundo entre importações
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        erros++;
        logger.error(`Erro ao importar ${arquivo.name}:`, error);
        resultados.push({
          sucesso: false,
          arquivo: arquivo.name,
          erro: error.message
        });
      }
    }
    
    return {
      sucesso: sucessos,
      duplicados: duplicados,
      erros: erros,
      detalhes: resultados
    };
  } catch (error) {
    logger.error('Erro ao importar lotes:', error);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  (async () => {
    try {
      await connectDatabase();
      
      const folderId = process.env.FOLDER_ID;
      if (!folderId) {
        throw new Error('FOLDER_ID não definido no .env');
      }
      
      const resultados = await importarTodosLotes(folderId);
      
      console.log('\n=== RESUMO DA IMPORTAÇÃO ===');
      resultados.forEach(r => {
        if (r.sucesso) {
          console.log(`✓ ${r.lote.nome}: ${r.lote.totalFotos} fotos`);
        } else {
          console.log(`✗ ${r.arquivo || r.loteExistente}: ${r.motivo || r.erro}`);
        }
      });
      
      process.exit(0);
    } catch (error) {
      logger.error('Erro fatal:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  importarLote,
  importarTodosLotes,
  listarCsvsDrive
};
