require('dotenv').config();
const mongoose = require('mongoose');
const { google } = require('googleapis');
const xlsx = require('xlsx');
const axios = require('axios');
const Foto = require('../models/Foto');
const logger = require('../utils/logger');

/**
 * Importa um lote específico do Google Drive para o MongoDB
 * Salva apenas URLs HTTP válidas (verifica se existem antes de salvar)
 */
async function importarLoteHTTP(nomeArquivo, fileIdExistente = null, servidorId = null) {
  try {
    logger.info(`📥 Iniciando importação: ${nomeArquivo}`);
    
    // Conectar MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('✅ MongoDB conectado');

    // Autenticar Google Drive usando variáveis de ambiente (Heroku)
    const credentials = {
      type: process.env.GOOGLE_TYPE,
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: process.env.GOOGLE_AUTH_URI,
      token_uri: process.env.GOOGLE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
      client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL
    };
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    logger.info('✅ Google Drive autenticado');

    let arquivo;
    
    // Se já temos o fileId, usar diretamente
    if (fileIdExistente) {
      arquivo = { 
        id: fileIdExistente, 
        name: nomeArquivo,
        size: 0 
      };
      logger.info(`📄 Usando arquivo com ID: ${fileIdExistente}`);
    } else {
      // Buscar arquivo no Drive (dentro da pasta do servidor se especificado)
      const folderId = process.env.FOLDER_ID;
      let query;
      
      if (servidorId) {
        // Buscar primeiro a pasta do servidor
        const folderQuery = `name = '${servidorId}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const folderResponse = await drive.files.list({
          q: folderQuery,
          fields: 'files(id)',
          pageSize: 1
        });
        
        if (!folderResponse.data.files || folderResponse.data.files.length === 0) {
          logger.error(`❌ Pasta ${servidorId} não encontrada`);
          return { success: false, message: `Pasta ${servidorId} não encontrada` };
        }
        
        const servidorFolderId = folderResponse.data.files[0].id;
        query = `name = '${nomeArquivo}' and '${servidorFolderId}' in parents and trashed = false`;
      } else {
        // Buscar na pasta raiz
        query = `name = '${nomeArquivo}' and '${folderId}' in parents and trashed = false`;
      }
      
      const listResponse = await drive.files.list({
        q: query,
        fields: 'files(id, name, size, createdTime)',
        orderBy: 'createdTime desc'
      });

      if (!listResponse.data.files || listResponse.data.files.length === 0) {
        logger.error(`❌ Arquivo não encontrado: ${nomeArquivo}`);
        return { success: false, message: 'Arquivo não encontrado' };
      }

      arquivo = listResponse.data.files[0];
    }
    
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

    // Log das primeiras linhas para debug
    if (dados.length > 0) {
      logger.info(`📋 Amostra das primeiras 3 linhas:`);
      for (let i = 0; i < Math.min(3, dados.length); i++) {
        const linha = dados[i];
        logger.info(`  ${i + 1}. CID: ${linha.cid} | URL: "${linha.link_ftp}" | Tipo: ${typeof linha.link_ftp}`);
      }
    }

    // Processar em lotes de 100
    const batchSize = 100;
    
    for (let i = 0; i < dados.length; i += batchSize) {
      const batch = dados.slice(i, i + batchSize);
      const promises = batch.map(async (linha) => {
        try {
          const httpUrl = linha.link_ftp;
          
          if (!httpUrl || !httpUrl.startsWith('https://')) {
            invalidas++;
            if (invalidas <= 5) {
              logger.warn(`URL inválida: "${httpUrl}" (tipo: ${typeof httpUrl})`);
            }
            return;
          }

          // Verificar se já existe
          const fotoExistente = await Foto.findOne({ httpUrl });
          if (fotoExistente) {
            duplicadas++;
            return;
          }

          // Salvar diretamente como pendente (validação será no processamento)
          const novaFoto = new Foto({
            driveFileId: arquivo.id,
            lote: nomeLote,
            httpUrl: httpUrl,
            cid: parseInt(linha.cid) || null,
            status: 'pendente'
          });

          await novaFoto.save();
          importadas++;

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
    logger.info(`   ✅ Importadas: ${resultado.importadas} (prontas para processar)`);
    logger.info(`   ⚠️  Duplicadas: ${resultado.duplicadas}`);
    logger.info(`   ❌ Inválidas: ${resultado.invalidas} (URL sem https ou vazia)`);
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
