require('dotenv').config();
const crypto = require('crypto');
const xlsx = require('xlsx');
const Lote = require('../models/Lote');
const Foto = require('../models/Foto');
const { connectDatabase } = require('../config/database');
const logger = require('../services/logger');

// Usar serviço híbrido (Planilhas Drive + Fotos FTP)
const hybridStorage = require('../services/hybridStorageService');

/**
 * Calcula hash SHA256 de uma string
 */
function calcularHash(conteudo) {
  return crypto.createHash('sha256').update(conteudo).digest('hex');
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
 * Importa um lote do storage híbrido
 * - Planilha vem do Google Drive
 * - Fotos vêm do FTP (usando caminho completo da coluna link_foto_plaqueta)
 */
async function importarLote(fileId, fileName) {
  const inicioImport = Date.now();
  logger.info(`Iniciando importação do lote: ${fileName} (HÍBRIDO: Drive+FTP)`);
  
  try {
    // Calcular hash do arquivo da planilha (Google Drive)
    const hashArquivo = await hybridStorage.calcularHashPlanilha(fileId);
    logger.debug(`Hash do arquivo: ${hashArquivo.substring(0, 16)}...`);
    
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
    
    // Baixar e parsear arquivo (CSV ou XLSX) do Google Drive
    const bufferArquivo = await hybridStorage.baixarPlanilhaDrive(fileId);
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
      storageType: 'hybrid', // Planilhas Drive + Fotos FTP
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
    const fotosNaoEncontradas = []; // Rastrear imagens não encontradas no FTP
    
    for (let i = 0; i < dadosArquivo.length; i += BATCH_SIZE) {
      const batch = dadosArquivo.slice(i, i + BATCH_SIZE);
      const fotos = [];
      
      for (const linha of batch) {
        // Aceitar múltiplos nomes de colunas
        const idPrisma = linha.cid || linha.id_prisma || linha.idPrisma || '';
        const linkFotoOriginal = linha.link_foto || linha.link_foto_plaqueta || linha.linkFotoPlaqueta || linha.link_ftp || '';
        
        if (!idPrisma || !linkFotoOriginal) {
          logger.warn(`Linha com dados incompletos: idPrisma=${idPrisma}, linkFoto=${linkFotoOriginal}`);
          continue;
        }
        
        // Normalizar link (remover domínio se for URL)
        // "https://prisma-ftp.perfilrk.com.br/45_ROCHA_MIRANDA/IMG.jpg" → "45_ROCHA_MIRANDA/IMG.jpg"
        const linkFotoNormalizado = hybridStorage.normalizarLinkFoto(linkFotoOriginal);
        
        // Hash único da foto (usar link normalizado para detectar duplicatas)
        const hashFoto = calcularHash(`${idPrisma}:${linkFotoNormalizado}`);
        
        // Verificar se foto já existe
        const fotoExistente = await Foto.findOne({ hashFoto });
        if (fotoExistente) {
          fotosDuplicadas++;
          logger.debug(`Foto duplicada: ${linkFotoNormalizado} (lote: ${fotoExistente.lote})`);
          continue;
        }
        
        // Buscar foto no FTP (função já normaliza internamente)
        const caminhoFTP = await hybridStorage.buscarFotoFtp(linkFotoOriginal);
        
        if (!caminhoFTP) {
          // NÃO TRAVAR - apenas registrar e continuar
          logger.warn(`Foto não encontrada no FTP: ${linkFotoNormalizado}`);
          fotosNaoEncontradas.push({
            cid: idPrisma,
            linkOriginal: linkFotoOriginal,
            linkNormalizado: linkFotoNormalizado
          });
          continue;
        }
        
        // Criar registro da foto APENAS se encontrada no FTP
        const foto = new Foto({
          idPrisma: String(idPrisma),
          linkFotoOriginal: linkFotoOriginal, // Link original do Excel
          ftpPath: caminhoFTP, // Caminho completo no FTP
          hashFoto,
          loteId: lote._id,
          loteNome: lote.nome,
          status: 'pendente'
        });
        
        fotos.push(foto);
        fotosImportadas++;
      }
      
      // Salvar batch de fotos
      if (fotos.length > 0) {
        await Foto.insertMany(fotos);
        lote.fotosImportadas = fotosImportadas;
        await lote.save();
        
        logger.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${fotos.length} fotos processadas`);
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
    
    if (fotosNaoEncontradas.length > 0) {
      lote.erros.push({
        mensagem: `${fotosNaoEncontradas.length} fotos não encontradas no FTP`,
        tipo: 'aviso'
      });
    }
    
    await lote.save();
    
    const tempoTotal = Date.now() - inicioImport;
    logger.info(`Lote ${nomeLote} importado com sucesso!`);
    logger.info(`Total: ${fotosImportadas} fotos em ${(tempoTotal / 1000).toFixed(2)}s`);
    logger.info(`Duplicadas: ${fotosDuplicadas}`);
    logger.info(`Não encontradas no FTP: ${fotosNaoEncontradas.length}`);
    
    if (fotosNaoEncontradas.length > 0) {
      logger.warn('Primeiras 10 fotos não encontradas:');
      fotosNaoEncontradas.slice(0, 10).forEach(f => {
        logger.warn(`  CID: ${f.cid} | Link: ${f.linkOriginal}`);
      });
    }
    
    return {
      sucesso: true,
      lote: {
        id: lote._id,
        nome: lote.nome,
        totalFotos: lote.totalFotos,
        fotosImportadas: lote.fotosImportadas,
        duplicadas: fotosDuplicadas,
        naoEncontradas: fotosNaoEncontradas.length
      },
      fotosNaoEncontradas: fotosNaoEncontradas, // Lista completa para o email
      tempoImportacao: tempoTotal
    };
    
  } catch (error) {
    logger.error(`Erro ao importar lote ${fileName}:`, error);
    throw error;
  }
}

/**
 * Importa todos os lotes do Google Drive (filtrados >= 50)
 */
async function importarTodosLotes(folderId = null) {
  logger.info('Iniciando importação de lotes (HÍBRIDO: Drive+FTP)...');
  
  try {
    const folder = folderId || process.env.FOLDER_ID;
    if (!folder) {
      throw new Error('FOLDER_ID não definido no .env');
    }

    // Listar planilhas do Drive (filtradas >= lote_100)
    const arquivos = await hybridStorage.listarPlanilhasDrive(folder);
    logger.info(`Encontrados ${arquivos.length} arquivo(s) válidos (>= lote_100)`);
    
    if (arquivos.length === 0) {
      logger.warn('Nenhum arquivo encontrado para importar');
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
      
      // Verificar conexão híbrida
      await hybridStorage.verificarConexaoHibrida();
      
      const folder = process.env.FOLDER_ID;
      if (!folder) {
        throw new Error('FOLDER_ID não definido no .env');
      }
      
      const resultados = await importarTodosLotes(folder);
      
      console.log('\n=== RESUMO DA IMPORTAÇÃO ===');
      console.log(`✅ Sucessos: ${resultados.sucesso}`);
      console.log(`⏭️  Duplicados: ${resultados.duplicados}`);
      console.log(`❌ Erros: ${resultados.erros}`);
      
      process.exit(0);
    } catch (error) {
      logger.error('Erro fatal:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  importarLote,
  importarTodosLotes
};
