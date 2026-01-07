require('dotenv').config();
const { google } = require('googleapis');

(async () => {
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
  
  const servidorId = process.env.SERVIDOR_ID || 'servidor_A';
  const pastaId = servidorId === 'servidor_A' ? '1hiHRRxRD2FDuemrUMsR3yINxaLzxh8zK' : '1mvNlZCDTwCxwZwEh3nWKl6rRkzaa9hUz';
  
  console.log(`Buscando arquivos na pasta: ${servidorId} (${pastaId})\n`);
  
  const response = await drive.files.list({
    q: `'${pastaId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, createdTime)',
    orderBy: 'name',
    pageSize: 100
  });
  
  console.log(`Total de arquivos: ${response.data.files.length}\n`);
  
  response.data.files.forEach((file, index) => {
    const size = file.size ? `${(file.size / 1024).toFixed(1)}KB` : 'N/A';
    console.log(`${index + 1}. ${file.name}`);
    console.log(`   ID: ${file.id}`);
    console.log(`   Tipo: ${file.mimeType}`);
    console.log(`   Tamanho: ${size}\n`);
  });
})();
