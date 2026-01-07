require('dotenv').config();
const { google } = require('googleapis');
const xlsx = require('xlsx');

(async () => {
  console.log('Testando importação de algumas linhas...\n');
  
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
  
  // Baixar Lote_02
  const fileId = '1TDoZ4_Gq3QKLnwgAIjaP9yfk8LmI9N_S';
  
  console.log('Baixando arquivo do Drive...');
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  
  const buffer = Buffer.from(response.data);
  const workbook = xlsx.read(buffer);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const dados = xlsx.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  
  console.log(`Total de linhas: ${dados.length}\n`);
  console.log('Primeiras 20 linhas:\n');
  
  let validas = 0;
  let invalidas = 0;
  
  for (let i = 0; i < Math.min(20, dados.length); i++) {
    const linha = dados[i];
    const httpUrl = linha.link_ftp;
    const valida = httpUrl && httpUrl.startsWith('https://');
    
    if (valida) {
      validas++;
    } else {
      invalidas++;
    }
    
    console.log(`${i + 1}. CID: ${linha.cid}`);
    console.log(`   URL: "${httpUrl}"`);
    console.log(`   Tipo: ${typeof httpUrl}`);
    console.log(`   Válida: ${valida ? '✅' : '❌'}`);
    console.log('');
  }
  
  console.log(`\nResumo das 20 primeiras:`);
  console.log(`  Válidas: ${validas}`);
  console.log(`  Inválidas: ${invalidas}`);
  
  // Estatísticas gerais
  console.log(`\n${'='.repeat(60)}`);
  console.log('Analisando arquivo completo...\n');
  
  let totalValidas = 0;
  let totalInvalidas = 0;
  const exemplosInvalidos = [];
  
  for (const linha of dados) {
    const httpUrl = linha.link_ftp;
    if (httpUrl && httpUrl.startsWith('https://')) {
      totalValidas++;
    } else {
      totalInvalidas++;
      if (exemplosInvalidos.length < 10) {
        exemplosInvalidos.push({ cid: linha.cid, url: httpUrl, tipo: typeof httpUrl });
      }
    }
  }
  
  console.log(`Total: ${dados.length} linhas`);
  console.log(`Válidas: ${totalValidas} (${((totalValidas/dados.length)*100).toFixed(1)}%)`);
  console.log(`Inválidas: ${totalInvalidas} (${((totalInvalidas/dados.length)*100).toFixed(1)}%)`);
  
  if (exemplosInvalidos.length > 0) {
    console.log('\nExemplos de URLs inválidas:');
    exemplosInvalidos.forEach((ex, i) => {
      console.log(`${i + 1}. CID: ${ex.cid} | URL: "${ex.url}" | Tipo: ${ex.tipo}`);
    });
  }
})();
