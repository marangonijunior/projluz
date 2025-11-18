const { Resend } = require('resend');
require('dotenv').config();

// Inicializar cliente Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Configuração de emails
const emailConfig = {
  from: process.env.EMAIL_FROM || 'contact@marangonijunior.co.uk',
  to: process.env.EMAIL_TO ? process.env.EMAIL_TO.split(',').map(e => e.trim()) : [],
  resend
};

/**
 * Verifica se as configurações de email estão corretas
 */
async function verifyEmailConfig() {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️  RESEND_API_KEY não configurado');
      return false;
    }

    if (!emailConfig.to || emailConfig.to.length === 0) {
      console.warn('⚠️  Nenhum destinatário configurado (EMAIL_TO)');
      return false;
    }

    console.log('✅ Configuração de email verificada');
    console.log(`   From: ${emailConfig.from}`);
    console.log(`   To: ${emailConfig.to.join(', ')}`);
    return true;
  } catch (error) {
    console.error('❌ Erro na configuração de email:', error.message);
    return false;
  }
}

module.exports = {
  emailConfig,
  verifyEmailConfig
};
