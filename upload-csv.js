const { getDriveInstance, FOLDER_ID } = require('./src/config/google-drive');
const fs = require('fs');
const path = require('path');

async function uploadCsv(localFilePath) {
  try {
    console.log('📤 Fazendo upload para Google Drive...\n');
    
    // Verifica se o arquivo existe
    if (!fs.existsSync(localFilePath)) {
      console.error(`❌ Arquivo não encontrado: ${localFilePath}`);
      return;
    }
    
    const drive = await getDriveInstance();
    const fileName = path.basename(localFilePath);
    
    console.log(`📁 Arquivo local: ${localFilePath}`);
    console.log(`📝 Nome no Drive: ${fileName}`);
    console.log(`🎯 Pasta destino: ${FOLDER_ID}\n`);
    
    // Faz upload
    const fileMetadata = {
      name: fileName,
      parents: [FOLDER_ID]
    };
    
    const media = {
      mimeType: 'text/csv',
      body: fs.createReadStream(localFilePath)
    };
    
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });
    
    console.log('✅ Upload concluído!');
    console.log(`   ID: ${file.data.id}`);
    console.log(`   Nome: ${file.data.name}`);
    console.log(`   Link: ${file.data.webViewLink}\n`);
    
  } catch (error) {
    console.error('❌ Erro no upload:', error.message);
  }
}

// Verifica argumentos
const filePath = process.argv[2];

if (!filePath) {
  console.log('📋 Uso: node upload-csv.js <caminho-do-arquivo>\n');
  console.log('Exemplo:');
  console.log('  node upload-csv.js ./lote_001.csv');
  console.log('  node upload-csv.js ~/Downloads/teste_plaqueta.csv\n');
  process.exit(1);
}

uploadCsv(filePath);
