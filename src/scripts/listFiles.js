const driveService = require('../services/driveService');
const logger = require('../utils/logger');

/**
 * Script para listar arquivos CSV e XLSX no Google Drive
 */
async function listarArquivos() {
  try {
    console.log('\n🔍 Listando arquivos no Google Drive...\n');
    
    const arquivos = await driveService.listCsvFiles();
    
    if (!arquivos || arquivos.length === 0) {
      console.log('❌ Nenhum arquivo encontrado na pasta.');
      return;
    }
    
    console.log(`✅ ${arquivos.length} arquivo(s) encontrado(s):\n`);
    console.log('─'.repeat(100));
    console.log('Nome'.padEnd(50), 'Tipo'.padEnd(30), 'ID');
    console.log('─'.repeat(100));
    
    arquivos.forEach((arquivo, index) => {
      const tipo = arquivo.mimeType === 'text/csv' ? 'CSV' : 
                   arquivo.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ? 'XLSX' :
                   'Outro';
      
      console.log(
        `${(index + 1).toString().padStart(2)}. ${arquivo.name.padEnd(47)}`,
        tipo.padEnd(30),
        arquivo.id
      );
    });
    
    console.log('─'.repeat(100));
    console.log(`\n📊 Resumo:`);
    
    const csvCount = arquivos.filter(a => a.mimeType === 'text/csv').length;
    const xlsxCount = arquivos.filter(a => a.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').length;
    
    console.log(`   CSV:  ${csvCount}`);
    console.log(`   XLSX: ${xlsxCount}`);
    console.log(`   Total: ${arquivos.length}\n`);
    
  } catch (error) {
    console.error('❌ Erro ao listar arquivos:', error.message);
    logger.error('Erro no script listFiles:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  listarArquivos()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Erro fatal:', error);
      process.exit(1);
    });
}

module.exports = { listarArquivos };
