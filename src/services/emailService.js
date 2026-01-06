const { emailConfig } = require('../config/email');
const logger = require('../utils/logger');

/**
 * Formata duração em segundos para string legível
 * @param {number} seconds - Duração em segundos
 * @returns {string} - String formatada (ex: "2h 15min 30s")
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}min`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Gera HTML do email de resumo
 * @param {object} stats - Estatísticas do processamento
 * @returns {string} - HTML do email
 */
function generateEmailHtml(stats) {
  const successPercent = ((stats.success / stats.total) * 100).toFixed(2);
  const failurePercent = ((stats.failures / stats.total) * 100).toFixed(2);
  const avgTime = (stats.duration / stats.total).toFixed(2);
  
  // Gera nome do lote (sem extensão)
  const nomeLote = stats.batchName.replace(/\.(csv|xlsx)$/i, '');
  
  // URL base da API
  const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
  
  // Links dos endpoints
  const loteUrl = `${API_BASE_URL}/api/lotes/${nomeLote}`;
  const exportUrl = `${API_BASE_URL}/api/lotes/${nomeLote}/export`;
  const statusUrl = `${API_BASE_URL}/api/lotes/${nomeLote}/status`;
  const fotosUrl = `${API_BASE_URL}/api/lotes/${nomeLote}/fotos`;
  
  // Seção de imagens não encontradas (se houver)
  const notFoundSection = stats.notFoundImages && stats.notFoundImages.length > 0 ? `
    <div class="stats" style="background: #fff3cd; border-left: 4px solid #ffc107;">
      <h3 style="color: #856404;">⚠️ Imagens Não Encontradas no FTP (${stats.notFoundImages.length})</h3>
      <p style="margin: 10px 0; color: #856404;">
        As imagens abaixo estão listadas no Excel mas não foram encontradas no servidor FTP.
        Elas <strong>NÃO foram importadas</strong> para o banco de dados.
      </p>
      <div style="max-height: 400px; overflow-y: auto; background: white; padding: 15px; border-radius: 5px; margin-top: 15px;">
        ${stats.notFoundImages.map((img, index) => `
          <div style="padding: 10px; border-bottom: 1px solid #eee; ${index >= 50 ? 'display: none;' : ''}">
            <strong>CID:</strong> ${img.cid}<br>
            <strong>Link:</strong> <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 3px; font-size: 11px; word-break: break-all;">${img.linkOriginal}</code><br>
            <strong>Normalizado:</strong> <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 3px; font-size: 11px;">${img.linkNormalizado}</code>
          </div>
        `).join('')}
        ${stats.notFoundImages.length > 50 ? `
          <div style="padding: 15px; text-align: center; color: #856404;">
            <em>... e mais ${stats.notFoundImages.length - 50} imagens não encontradas</em>
          </div>
        ` : ''}
      </div>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .container {
      background: #f9f9f9;
      padding: 20px;
      border-radius: 0 0 10px 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .stats {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .stats h3 {
      margin-top: 0;
      color: #667eea;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #eee;
    }
    .stat-row:last-child {
      border-bottom: none;
    }
    .stat-label {
      font-weight: 500;
      color: #666;
    }
    .stat-value {
      font-weight: bold;
      color: #333;
    }
    .success {
      color: #28a745;
    }
    .failure {
      color: #dc3545;
    }
    .info {
      background: #e3f2fd;
      padding: 15px;
      border-left: 4px solid #2196f3;
      border-radius: 4px;
      margin: 20px 0;
    }
    .attachment-notice {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      color: #999;
      font-size: 12px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white !important;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 5px;
      font-weight: bold;
      margin: 10px 5px;
      transition: transform 0.2s;
    }
    .cta-button:hover {
      transform: translateY(-2px);
    }
    .links-section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .links-section h3 {
      margin-top: 0;
      color: #667eea;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .link-item {
      padding: 10px;
      border-left: 3px solid #667eea;
      margin: 10px 0;
      background: #f8f9fa;
    }
    .link-item code {
      background: #e9ecef;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
      color: #495057;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Processamento Concluído</h1>
    <p style="margin: 10px 0 0 0;">Lote: <strong>${stats.batchName}</strong></p>
  </div>
  
  <div class="container">
    <div class="info">
      <strong>⏰ Data/Hora:</strong> ${stats.timestamp}
    </div>

    <div class="stats">
      <h3>📈 Estatísticas do Processamento</h3>
      
      <div class="stat-row">
        <span class="stat-label">📸 Total de fotos analisadas:</span>
        <span class="stat-value">${stats.total}</span>
      </div>

      <div class="stat-row">
        <span class="stat-label success">✅ Sucesso:</span>
        <span class="stat-value success">${stats.success} (${successPercent}%)</span>
      </div>

      <div class="stat-row">
        <span class="stat-label failure">❌ Falhas:</span>
        <span class="stat-value failure">${stats.failures} (${failurePercent}%)</span>
      </div>

      <div class="stat-row">
        <span class="stat-label">⏱️ Tempo total:</span>
        <span class="stat-value">${formatDuration(stats.duration)}</span>
      </div>

      <div class="stat-row">
        <span class="stat-label">📈 Média por foto:</span>
        <span class="stat-value">${avgTime}s</span>
      </div>
    </div>

    <div class="links-section">
      <h3>🔗 Links Úteis</h3>
      
      <div class="link-item">
        <strong>📥 Exportar Resultados (CSV)</strong><br>
        <a href="${exportUrl}" class="cta-button" style="margin: 10px 0; display: inline-block;">
          ⬇️ Baixar CSV Completo
        </a><br>
        <code>GET ${exportUrl}</code>
      </div>

      <div class="link-item">
        <strong>📊 Detalhes do Lote</strong><br>
        <a href="${loteUrl}" target="_blank">Ver informações completas</a><br>
        <code>GET ${loteUrl}</code>
      </div>

      <div class="link-item">
        <strong>📸 Ver Fotos Processadas</strong><br>
        <a href="${fotosUrl}" target="_blank">Listar todas as fotos</a><br>
        <code>GET ${fotosUrl}?status=sucesso</code>
      </div>

      <div class="link-item">
        <strong>⏱️ Status em Tempo Real</strong><br>
        <a href="${statusUrl}" target="_blank">Monitorar progresso</a><br>
        <code>GET ${statusUrl}</code>
      </div>
    </div>

    <div class="attachment-notice">
      <strong>💡 Dica</strong><br>
      Use os links acima para acessar os resultados diretamente pela API REST. 
      O arquivo CSV pode ser baixado clicando no botão "Baixar CSV Completo" acima.
    </div>

    ${notFoundSection}
  </div>

  <div class="footer">
    <p>Sistema de Processamento de Imagens - Projluz</p>
    <p>Este é um email automático, não responda.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Envia email com resumo do processamento e links da API
 * @param {object} stats - Estatísticas do processamento
 * @returns {Promise<boolean>} - true se enviado com sucesso
 */
async function sendSummaryEmail(stats) {
  try {
    const { resend, from, to } = emailConfig;

    if (!to || to.length === 0) {
      logger.warn('Nenhum destinatário configurado para email');
      return false;
    }

    const emailData = {
      from,
      to,
      subject: `✅ Processamento ${stats.batchName} - Concluído`,
      html: generateEmailHtml(stats)
    };

    const { data, error } = await resend.emails.send(emailData);

    if (error) {
      throw new Error(error.message);
    }
    
    logger.info(`✅ Email enviado com sucesso: ${data.id}`);
    logger.info(`Destinatários: ${to.join(', ')}`);
    
    return true;
  } catch (error) {
    logger.error('❌ Erro ao enviar email:', error);
    return false;
  }
}

/**
 * Envia email de notificação de erro crítico
 * @param {string} batchName - Nome do lote
 * @param {string} errorMessage - Mensagem de erro
 * @returns {Promise<boolean>} - true se enviado com sucesso
 */
async function sendErrorEmail(batchName, errorMessage) {
  try {
    const { resend, from, to } = emailConfig;

    if (!to || to.length === 0) {
      return false;
    }

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: `⚠️ ERRO no Processamento - ${batchName}`,
      html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #dc3545; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
    <h2 style="margin: 0;">⚠️ Erro Crítico no Processamento</h2>
  </div>
  <p><strong>Arquivo:</strong> ${batchName}</p>
  <p><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</p>
  <div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <strong>Erro:</strong><br>
    <code style="color: #721c24;">${errorMessage}</code>
  </div>
  <p>Por favor, verifique os logs para mais detalhes.</p>
</div>
      `
    });

    if (error) {
      throw new Error(error.message);
    }

    logger.info('✅ Email de erro enviado com sucesso');
    
    return true;
  } catch (error) {
    logger.error('❌ Erro ao enviar email de erro:', error);
    return false;
  }
}

module.exports = {
  sendSummaryEmail,
  sendErrorEmail,
  formatDuration,
  generateEmailHtml
};
