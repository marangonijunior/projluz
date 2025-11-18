const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Carregar credenciais
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-credentials.json';
const FOLDER_ID = process.env.FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID;

let auth = null;

/**
 * Inicializa autenticação com Google Drive
 */
async function initAuth() {
  try {
    const credentialsPath = path.resolve(CREDENTIALS_PATH);
    
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Arquivo de credenciais não encontrado: ${credentialsPath}`);
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });

    return auth;
  } catch (error) {
    console.error('Erro ao inicializar autenticação Google Drive:', error.message);
    throw error;
  }
}

/**
 * Obtém instância do Google Drive
 */
async function getDriveInstance() {
  if (!auth) {
    await initAuth();
  }

  return google.drive({ version: 'v3', auth });
}

module.exports = {
  initAuth,
  getDriveInstance,
  FOLDER_ID
};
