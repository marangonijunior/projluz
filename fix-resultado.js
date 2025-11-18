const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { getDriveInstance, FOLDER_ID } = require('./src/config/google-drive');

async function fixResultado() {
  try {
    console.log('🔧 Corrigindo arquivo de resultado...\n');
    
    // 1. Baixar CSV original do Google Drive
    console.log('📥 Baixando lote_001.csv do Google Drive...');
    const drive = await getDriveInstance();
    
    const response = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name='lote_001.csv' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 1
    });
    
    if (!response.data.files || response.data.files.length === 0) {
      console.error('❌ Arquivo lote_001.csv não encontrado no Google Drive');
      return;
    }
    
    const fileId = response.data.files[0].id;
    const fileResponse = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    
    const originalBuffer = Buffer.from(fileResponse.data);
    
    // 2. Parse do CSV original
    console.log('📋 Lendo CSV original...');
    const originalData = await parseCSV(originalBuffer);
    console.log(`   ${originalData.length} registros encontrados\n`);
    
    // Criar mapa de ID -> URL
    const urlMap = new Map();
    originalData.forEach(row => {
      const id = row.id_prisma || row.id;
      const url = row.link_foto_plaqueta || row.file_url;
      if (id && url) {
        urlMap.set(String(id), url);
      }
    });
    
    // 3. Ler arquivo de resultado
    const resultPath = path.join(__dirname, 'results', 'lote_001_resultado.csv');
    
    if (!fs.existsSync(resultPath)) {
      console.error('❌ Arquivo de resultado não encontrado');
      return;
    }
    
    console.log('📄 Lendo arquivo de resultado...');
    const resultBuffer = fs.readFileSync(resultPath);
    const resultData = await parseCSV(resultBuffer);
    console.log(`   ${resultData.length} registros processados\n`);
    
    // 4. Corrigir registros
    console.log('✏️  Corrigindo URLs...');
    let fixed = 0;
    resultData.forEach(row => {
      const id = String(row.id);
      if (urlMap.has(id)) {
        row.link_foto_plaqueta = urlMap.get(id);
        fixed++;
      }
    });
    
    console.log(`   ${fixed} registros corrigidos\n`);
    
    // 5. Gerar novo CSV
    console.log('💾 Salvando arquivo corrigido...');
    const headers = ['id', 'link_foto_plaqueta', 'numero_encontrado', 'confidencialidade', 'falhou'];
    const headerLine = headers.join(',');
    
    const dataLines = resultData.map(row => {
      return headers.map(h => {
        const value = row[h] ?? '';
        if (String(value).includes(',') || String(value).includes('"')) {
          return `"${String(value).replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });
    
    const csvContent = [headerLine, ...dataLines].join('\n');
    fs.writeFileSync(resultPath, csvContent, 'utf8');
    
    console.log('✅ Arquivo corrigido com sucesso!');
    console.log(`   Caminho: ${resultPath}\n`);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(buffer.toString());
    
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

fixResultado();
