const { getDriveInstance } = require('./src/config/google-drive');

async function getServiceAccountEmail() {
  try {
    console.log('🔍 Informações da Conta de Serviço\n');
    
    const drive = await getDriveInstance();
    
    // Pega informações sobre a conta
    const about = await drive.about.get({
      fields: 'user'
    });
    
    console.log('📧 Email da conta de serviço:');
    console.log(`   ${about.data.user.emailAddress}\n`);
    
    console.log('📋 Para compartilhar a pasta:');
    console.log('   1. Abra a pasta no Google Drive');
    console.log('   2. Clique em "Compartilhar" ou ⚙️');
    console.log('   3. Adicione este email com permissão de "Editor"');
    console.log(`   4. Cole o email: ${about.data.user.emailAddress}`);
    console.log('   5. Copie o ID da pasta da URL');
    console.log('   6. Atualize o GOOGLE_DRIVE_FOLDER_ID no arquivo .env\n');
    
    console.log('💡 Exemplo de URL da pasta:');
    console.log('   https://drive.google.com/drive/folders/ABC123xyz');
    console.log('   O ID é: ABC123xyz\n');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

getServiceAccountEmail();
