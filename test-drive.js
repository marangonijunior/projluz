const { getDriveInstance, FOLDER_ID } = require('./src/config/google-drive');

async function testDrive() {
  try {
    console.log('🔍 Testando conexão com Google Drive...');
    console.log(`📁 Pasta ID: ${FOLDER_ID}\n`);
    
    const drive = await getDriveInstance();
    
    // Lista TODOS os arquivos da pasta
    const response = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, createdTime)',
      orderBy: 'createdTime desc'
    });
    
    const files = response.data.files || [];
    
    if (files.length === 0) {
      console.log('❌ Nenhum arquivo encontrado na pasta!');
      console.log('\n📝 Para adicionar arquivos:');
      console.log(`   1. Acesse: https://drive.google.com/drive/folders/${FOLDER_ID}`);
      console.log('   2. Faça upload do arquivo teste_plaqueta.csv');
      console.log('   3. Execute este script novamente\n');
    } else {
      console.log(`✅ ${files.length} arquivo(s) encontrado(s):\n`);
      
      const csvFiles = files.filter(f => f.mimeType === 'text/csv' && !f.name.includes('_resultado'));
      const resultFiles = files.filter(f => f.mimeType === 'text/csv' && f.name.includes('_resultado'));
      const otherFiles = files.filter(f => f.mimeType !== 'text/csv');
      
      if (csvFiles.length > 0) {
        console.log('📄 Arquivos CSV para processar:');
        csvFiles.forEach(file => {
          console.log(`   - ${file.name} (ID: ${file.id})`);
        });
        console.log('');
      }
      
      if (resultFiles.length > 0) {
        console.log('✅ Arquivos de resultado:');
        resultFiles.forEach(file => {
          console.log(`   - ${file.name} (ID: ${file.id})`);
        });
        console.log('');
      }
      
      if (otherFiles.length > 0) {
        console.log('📦 Outros arquivos:');
        otherFiles.forEach(file => {
          console.log(`   - ${file.name} (${file.mimeType})`);
        });
        console.log('');
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.code === 'ENOENT') {
      console.log('\n⚠️  Arquivo de credenciais não encontrado!');
      console.log('   Verifique se existe: ./credentials/projluz-b485ebf65072.json');
    }
  }
}

testDrive();
