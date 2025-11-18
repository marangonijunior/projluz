const { getDriveInstance, FOLDER_ID } = require('./src/config/google-drive');

async function checkFolder() {
  try {
    console.log('🔍 Verificando informações da pasta...\n');
    console.log(`📁 ID da pasta: ${FOLDER_ID}\n`);
    
    const drive = await getDriveInstance();
    
    // Pega informações da pasta
    const folder = await drive.files.get({
      fileId: FOLDER_ID,
      fields: 'id, name, mimeType, parents, capabilities, webViewLink'
    });
    
    console.log('✅ Informações da pasta:');
    console.log(`   Nome: ${folder.data.name}`);
    console.log(`   ID: ${folder.data.id}`);
    console.log(`   Tipo: ${folder.data.mimeType}`);
    console.log(`   Link: ${folder.data.webViewLink}`);
    
    if (folder.data.parents) {
      console.log(`   Pasta pai: ${folder.data.parents.join(', ')}`);
    }
    
    console.log('\n🔐 Permissões:');
    console.log(`   Pode adicionar: ${folder.data.capabilities?.canAddChildren || false}`);
    console.log(`   Pode listar: ${folder.data.capabilities?.canListChildren || false}`);
    
    // Lista arquivos na pasta
    console.log('\n📂 Conteúdo da pasta:');
    const response = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, createdTime)',
      orderBy: 'name',
      pageSize: 100
    });
    
    const files = response.data.files || [];
    
    if (files.length === 0) {
      console.log('   (vazia)');
    } else {
      console.log(`   Total: ${files.length} arquivo(s)\n`);
      files.forEach((file, index) => {
        const size = file.size ? `${(file.size / 1024).toFixed(2)} KB` : 'N/A';
        console.log(`   ${index + 1}. ${file.name}`);
        console.log(`      ID: ${file.id}`);
        console.log(`      Tipo: ${file.mimeType}`);
        console.log(`      Tamanho: ${size}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.code === 404) {
      console.log('\n⚠️  Pasta não encontrada!');
      console.log('   Verifique se o ID da pasta está correto no arquivo .env');
      console.log(`   ID atual: ${FOLDER_ID}`);
    } else if (error.code === 403) {
      console.log('\n⚠️  Sem permissão de acesso!');
      console.log('   A conta de serviço não tem acesso a esta pasta.');
      console.log('   Compartilhe a pasta com o email da conta de serviço.');
    }
  }
}

checkFolder();
