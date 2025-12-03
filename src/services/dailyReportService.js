const { emailConfig } = require('../config/email');
const Lote = require('../models/Lote');
const Foto = require('../models/Foto');
const logger = require('../services/logger');

/**
 * Gera relatório diário de estatísticas
 */
async function gerarRelatorioDiario() {
  try {
    logger.info('📊 Gerando relatório diário...');

    const agora = new Date();
    const inicioSemana = new Date(agora);
    inicioSemana.setDate(agora.getDate() - agora.getDay()); // Domingo
    inicioSemana.setHours(0, 0, 0, 0);
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0);

    // Estatísticas de FOTOS
    const [totalGeral, totalMes, totalSemana] = await Promise.all([
      Foto.countDocuments({ status: 'sucesso' }),
      Foto.countDocuments({ 
        status: 'sucesso',
        dataProcessamento: { $gte: inicioMes }
      }),
      Foto.countDocuments({ 
        status: 'sucesso',
        dataProcessamento: { $gte: inicioSemana }
      })
    ]);

    // Estatísticas de LOTES
    const [
      lotesConcluidos,
      lotesPendentes,
      lotesProcessando,
      lotesConcluidosMes,
      lotesConcluidosSemana
    ] = await Promise.all([
      Lote.countDocuments({ status: 'concluido' }),
      Lote.countDocuments({ status: 'pendente' }),
      Lote.countDocuments({ status: 'processando' }),
      Lote.countDocuments({ 
        status: 'concluido',
        dataConclusao: { $gte: inicioMes }
      }),
      Lote.countDocuments({ 
        status: 'concluido',
        dataConclusao: { $gte: inicioSemana }
      })
    ]);

    // Fotos com falha
    const [fotosFalhaTotal, fotosFalhaMes, fotosFalhaSemana] = await Promise.all([
      Foto.countDocuments({ status: 'falha' }),
      Foto.countDocuments({ 
        status: 'falha',
        dataProcessamento: { $gte: inicioMes }
      }),
      Foto.countDocuments({ 
        status: 'falha',
        dataProcessamento: { $gte: inicioSemana }
      })
    ]);

    const stats = {
      fotos: {
        total: totalGeral,
        mes: totalMes,
        semana: totalSemana,
        falhaTotal: fotosFalhaTotal,
        falhaMes: fotosFalhaMes,
        falhaSemana: fotosFalhaSemana
      },
      lotes: {
        concluidos: lotesConcluidos,
        pendentes: lotesPendentes,
        processando: lotesProcessando,
        concluidosMes: lotesConcluidosMes,
        concluidosSemana: lotesConcluidosSemana
      },
      data: agora.toLocaleDateString('pt-BR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    };

    logger.info('✅ Estatísticas coletadas:', stats);

    return stats;

  } catch (error) {
    logger.error('Erro ao gerar relatório diário:', error);
    throw error;
  }
}

/**
 * Gera HTML do email de relatório diário
 */
function gerarHtmlRelatorioDiario(stats) {
  const taxaSucessoTotal = stats.fotos.total > 0 
    ? ((stats.fotos.total / (stats.fotos.total + stats.fotos.falhaTotal)) * 100).toFixed(2)
    : 0;

  const taxaSucessoMes = stats.fotos.mes > 0 
    ? ((stats.fotos.mes / (stats.fotos.mes + stats.fotos.falhaMes)) * 100).toFixed(2)
    : 0;

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
      max-width: 700px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .header p {
      margin: 0;
      opacity: 0.9;
      font-size: 14px;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 0 0 10px 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .section {
      margin: 30px 0;
    }
    .section-title {
      font-size: 20px;
      color: #667eea;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
    }
    .section-title .icon {
      font-size: 24px;
      margin-right: 10px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat-card {
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .stat-card.primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .stat-card.success {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      color: white;
    }
    .stat-card.warning {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      color: white;
    }
    .stat-value {
      font-size: 36px;
      font-weight: bold;
      margin: 10px 0;
    }
    .stat-label {
      font-size: 14px;
      opacity: 0.9;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #eee;
    }
    .stat-row:last-child {
      border-bottom: none;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
    }
    .badge.success {
      background: #38ef7d;
      color: white;
    }
    .badge.warning {
      background: #f5576c;
      color: white;
    }
    .badge.info {
      background: #667eea;
      color: white;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Relatório Diário - ProjLuz</h1>
    <p>${stats.data}</p>
  </div>
  
  <div class="container">
    <!-- RESUMO PRINCIPAL -->
    <div class="section">
      <div class="section-title">
        <span class="icon">📸</span>
        Fotos Processadas
      </div>
      
      <div class="stats-grid">
        <div class="stat-card primary">
          <div class="stat-label">Total Geral</div>
          <div class="stat-value">${stats.fotos.total.toLocaleString('pt-BR')}</div>
          <div class="stat-label">${taxaSucessoTotal}% sucesso</div>
        </div>
        
        <div class="stat-card success">
          <div class="stat-label">Este Mês</div>
          <div class="stat-value">${stats.fotos.mes.toLocaleString('pt-BR')}</div>
          <div class="stat-label">${taxaSucessoMes}% sucesso</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-label">Esta Semana</div>
          <div class="stat-value">${stats.fotos.semana.toLocaleString('pt-BR')}</div>
        </div>
      </div>
    </div>

    <!-- LOTES -->
    <div class="section">
      <div class="section-title">
        <span class="icon">📦</span>
        Status dos Lotes
      </div>
      
      <div class="stat-row">
        <span><strong>Lotes Concluídos (Total)</strong></span>
        <span><span class="badge success">${stats.lotes.concluidos}</span></span>
      </div>
      
      <div class="stat-row">
        <span><strong>Lotes Concluídos (Este Mês)</strong></span>
        <span><span class="badge success">${stats.lotes.concluidosMes}</span></span>
      </div>
      
      <div class="stat-row">
        <span><strong>Lotes Concluídos (Esta Semana)</strong></span>
        <span><span class="badge success">${stats.lotes.concluidosSemana}</span></span>
      </div>
      
      <div class="stat-row">
        <span><strong>Lotes Pendentes</strong></span>
        <span><span class="badge warning">${stats.lotes.pendentes}</span></span>
      </div>
      
      <div class="stat-row">
        <span><strong>Lotes em Processamento</strong></span>
        <span><span class="badge info">${stats.lotes.processando}</span></span>
      </div>
    </div>

    <!-- FALHAS -->
    <div class="section">
      <div class="section-title">
        <span class="icon">❌</span>
        Fotos com Falha
      </div>
      
      <div class="stat-row">
        <span><strong>Total Geral</strong></span>
        <span>${stats.fotos.falhaTotal.toLocaleString('pt-BR')}</span>
      </div>
      
      <div class="stat-row">
        <span><strong>Este Mês</strong></span>
        <span>${stats.fotos.falhaMes.toLocaleString('pt-BR')}</span>
      </div>
      
      <div class="stat-row">
        <span><strong>Esta Semana</strong></span>
        <span>${stats.fotos.falhaSemana.toLocaleString('pt-BR')}</span>
      </div>
    </div>

    <div class="footer">
      <p>ProjLuz v2.0 - Sistema de Processamento Automático</p>
      <p>Este é um email automático enviado diariamente às 06:00</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Envia email de relatório diário
 */
async function enviarRelatorioDiario() {
  try {
    logger.info('');
    logger.info('═══════════════════════════════════════════════');
    logger.info('📧 Enviando relatório diário');
    logger.info('═══════════════════════════════════════════════');

    // Gerar estatísticas
    const stats = await gerarRelatorioDiario();

    // Gerar HTML
    const html = gerarHtmlRelatorioDiario(stats);

    // Enviar email
    const { Resend } = require('resend');
    const resend = new Resend(emailConfig.apiKey);

    const resultado = await resend.emails.send({
      from: emailConfig.from,
      to: 'contact@marangonijunior.co.uk',
      subject: `📊 Relatório Diário ProjLuz - ${stats.data}`,
      html
    });

    logger.info('✅ Relatório diário enviado com sucesso!');
    logger.info(`   Email ID: ${resultado.data?.id || 'N/A'}`);
    logger.info('');

    return { sucesso: true, emailId: resultado.data?.id };

  } catch (error) {
    logger.error('❌ Erro ao enviar relatório diário:', error);
    throw error;
  }
}

module.exports = {
  gerarRelatorioDiario,
  enviarRelatorioDiario
};
