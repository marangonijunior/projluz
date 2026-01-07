require('dotenv').config();
const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const axios = require('axios');
const Foto = require('../models/Foto');
const logger = require('../utils/logger');

/**
 * Importa um lote específico do Google Drive para o MongoDB
 * Salva apenas URLs HTTP válidas (verifica se existem antes de salvar)
 */
async function importarLoteHTTP(nomeArquivo) {
  try {
    logger.info(`📥 Iniciando importação: ${nomeArquivo}`);
    
    // Conectar MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('✅ MongoDB conectado');

    // Autenticar Google Drive
    const credentialsPath = path.join(__dirname, '../../credentials/projluz-b485ebf65072.json');
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    logger.info('✅ Google Drive autenticado');

    // Buscar arquivo no Drive
    const folderId = process.env.FOLDER_ID;
    const query = `name = '${nomeArquivo}' and '${folderId}' in parents and trashed = false`;
    
    const listResponse = await drive.files.list({
      q: query,
      fields: 'files(id, name, size, createdTime)',
      orderBy: 'createdTime desc'
    });

    if (!listResponse.data.files || listResponse.data.files.length === 0) {
      logger.error(`❌ Arquivo não encontrado: ${nomeArquivo}`);
      return { success: false, message: 'Arquivo não encontrado' };
    }

    const arquivo = listResponse.data.files[0];
    logger.info(`📄 Arquivo encontrado: ${arquivo.name} (${(arquivo.size / 1024).toFixed(1)}KB)`);

    // Baixar arquivo
    const response = await drive.files.get(
      { fileId: arquivo.id, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    
    const buffer = Buffer.from(response.data);
    const workbook = xlsx.read(buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const dados = xlsx.utils.sheet_to_json(sheet, { raw: false, defval: '' });
    
    logger.info(`📊 Total de linhas: ${dados.length}`);

    // Extrair número do lote (ex: Lote_01 -> 01)
    const match = nomeArquivo.match(/Lote[_\s]?(\d+)/i);
    const numeroLote = match ? match[1].padStart(2, '0') : '00';
    const nomeLote = `Lote_${numeroLote}`;

    logger.info(`🏷️  Nome do lote: ${nomeLote}`);

    // Estatísticas
    let importadas = 0;
    let duplicadas = 0;
    let invalidas = 0;
    let erros = 0;

    // Processar em lotes de 100
    const batchSize = 100;
    
    for (let i = 0; i < dados.length; i += batchSize) {
      const batch = dados.slice(i, i + batchSize);
      const promises = batch.map(async (linha) => {
        try {
          const httpUrl = linha.link_ftp;
          
          if (!httpUrl || !httpUrl.startsWith('https://')) {
            invalidas++;
            return;
          }

          // Verificar se já existe
          const fotoExistente = await Foto.findOne({ httpUrl });
          if (fotoExistente) {
            duplicadas++;
            return;
          }

          // Verificar se URL é válida (timeout curto)
          let urlValida = false;
          try {
            await axios.head(httpUrl, { timeout: 3000 });
            urlValida = true;
          } catch (err) {
            // URL inválida - salvar como erro no banco
            const fotoComErro = new Foto({
              driveFileId: arquivo.id,
              lote: nomeLote,
              httpUrl: httpUrl,
              cid: parseInt(linha.cid) || null,
              status: 'erro',
              numeroDetectado: null,
              confianca: 0,
              observacoes: [{
                tipo: 'erro_download',
                mensagem: `URL inválida ou foto não encontrada: ${err.message}`,
                timestamp: new Date()
              }]
            });
            
            await fotoComErro.save();
            invalidas++;
            return;
          }

          // Salvar no banco como pendente (URL válida)
          if (urlValida) {
            const novaFoto = new Foto({
              driveFileId: arquivo.id,
              lote: nomeLote,
              httpUrl: httpUrl,
              cid: parseInt(linha.cid) || null,
              status: 'pendente'
            });

            await novaFoto.save();
            importadas++;
          }

        } catch (error) {
          erros++;
          logger.error(`Erro ao processar linha: ${error.message}`);
        }
      });

      await Promise.all(promises);
      
      const progresso = Math.min(i + batchSize, dados.length);
      logger.info(`📊 Progresso: ${progresso}/${dados.length} (${importadas} importadas, ${duplicadas} duplicadas, ${invalidas} inválidas)`);
    }

    const resultado = {
      success: true,
      lote: nomeLote,
      total: dados.length,
      importadas,
      duplicadas,
      invalidas,
      erros
    };

    logger.info('='.repeat(80));
    logger.info(`✅ IMPORTAÇÃO CONCLUÍDA: ${nomeLote}`);
    logger.info(`   Total no arquivo: ${resultado.total}`);
    logger.info(`   ✅ Importadas: ${resultado.importadas}`);
    logger.info(`   ⚠️  Duplicadas: ${resultado.duplicadas}`);
    logger.info(`   ❌ Inválidas: ${resultado.invalidas}`);
    logger.info(`   🔥 Erros: ${resultado.erros}`);
    logger.info('='.repeat(80));

    await mongoose.disconnect();
    return resultado;

  } catch (error) {
    logger.error(`❌ Erro na importação: ${error.message}`);
    await mongoose.disconnect();
    throw error;
  }
}

// Se executado diretamente
if (require.main === module) {
  const nomeArquivo = process.argv[2];
  
  if (!nomeArquivo) {
    console.error('❌ Uso: node importarLoteHTTP.js <nome_arquivo>');
    console.error('   Exemplo: node importarLoteHTTP.js "Extração_das_Plaquetas_Lote_01_06_01_2026.xlsx"');
    process.exit(1);
  }

  importarLoteHTTP(nomeArquivo)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Erro:', error.message);
      process.exit(1);
    });
}

module.exports = { importarLoteHTTP };
