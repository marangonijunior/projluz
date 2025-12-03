const { emailConfig } = require('../config/email');
const Lote = require('../models/Lote');
const Foto = require('../models/Foto');
const logger = require('../services/logger');

/**
 * Gera relatório semanal de estatísticas
 */
async function gerarRelatorioSemanal() {
  try {
    logger.info('📊 Gerando relatório semanal...');

    const agora = new Date();
    
    // Início da semana (Domingo)
    const inicioSemana = new Date(agora);
    inicioSemana.setDate(agora.getDate() - agora.getDay());
    inicioSemana.setHours(0, 0, 0, 0);
    
    // Fim da semana (Sábado 23:59:59)
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6);
    fimSemana.setHours(23, 59, 59, 999);

    // LOTES - Total Geral
    const totalLotesRegistrados = await Lote.countDocuments();
    const totalLotesProcessados = await Lote.countDocuments({ status: 'concluido' });
    const totalLotesAguardando = await Lote.countDocuments({ 
      status: { $in: ['pendente', 'processando'] }
    });

    // LOTES - Semana Corrente
    const lotesProcessadosSemana = await Lote.find({
      status: 'concluido',
      dataConclusao: { 
        $gte: inicioSemana,
        $lte: fimSemana
      }
    }).lean();

    // Buscar detalhes de cada lote processado na semana
    const lotesDetalhados = await Promise.all(
      lotesProcessadosSemana.map(async (lote) => {
        const fotos = await Foto.find({ loteId: lote._id });
        const fotosSucesso = fotos.filter(f => f.status === 'sucesso').length;
        const fotosFalha = fotos.filter(f => f.status === 'falha').length;
        const fotosWarning = fotos.filter(f => f.status === 'warning').length;
        
        return {
          nome: lote.nome,
          dataConclusao: lote.dataConclusao,
          totalFotos: fotos.length,
          fotosSucesso,
          fotosFalha,
          fotosWarning,
          tempoProcessamento: lote.tempoTotalProcessamento 
            ? Math.floor(lote.tempoTotalProcessamento / 1000 / 60) 
            : 0
        };
      })
    );

    // LOTES aguardando (com detalhes de fotos)
    const lotesAguardando = await Lote.find({
      status: { $in: ['pendente', 'processando'] }
    }).lean();

    const lotesAguardandoDetalhados = await Promise.all(
      lotesAguardando.map(async (lote) => {
        const totalFotos = await Foto.countDocuments({ loteId: lote._id });
        const fotosProcessadas = await Foto.countDocuments({ 
          loteId: lote._id,
          status: { $in: ['sucesso', 'falha', 'warning'] }
        });
        const fotosPendentes = await Foto.countDocuments({ 
          loteId: lote._id,
          status: 'pendente'
        });
        
        return {
          nome: lote.nome,
          status: lote.status,
          totalFotos,
          fotosProcessadas,
          fotosPendentes,
          percentualConcluido: totalFotos > 0 
            ? Math.floor((fotosProcessadas / totalFotos) * 100) 
            : 0
        };
      })
    );

    // Totais de fotos na semana
    const totalFotosSemana = lotesDetalhados.reduce((acc, lote) => acc + lote.totalFotos, 0);
    const totalFotosSucessoSemana = lotesDetalhados.reduce((acc, lote) => acc + lote.fotosSucesso, 0);
    const totalFotosFalhaSemana = lotesDetalhados.reduce((acc, lote) => acc + lote.fotosFalha, 0);

    const stats = {
      periodo: {
        inicio: inicioSemana.toLocaleDateString('pt-BR'),
        fim: fimSemana.toLocaleDateString('pt-BR'),
        dataGeracao: agora.toLocaleDateString('pt-BR', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      },
      lotes: {
        totalRegistrados: totalLotesRegistrados,
        totalProcessados: totalLotesProcessados,
        totalAguardando: totalLotesAguardando,
        processadosSemana: lotesProcessadosSemana.length,
        detalhesProcessadosSemana: lotesDetalhados,
        detalhesAguardando: lotesAguardandoDetalhados
      },
      fotos: {
        totalSemana: totalFotosSemana,
        sucessoSemana: totalFotosSucessoSemana,
        falhaSemana: totalFotosFalhaSemana
      }
    };

    logger.info('✅ Estatísticas semanais coletadas');
    logger.info(`   Lotes processados na semana: ${stats.lotes.processadosSemana}`);
    logger.info(`   Fotos processadas na semana: ${stats.fotos.totalSemana}`);

    return stats;

  } catch (error) {
    logger.error('Erro ao gerar relatório semanal:', error);
    throw error;
  }
}

/**
 * Gera HTML do email de relatório semanal
 */
function gerarHtmlRelatorioSemanal(stats) {
  const taxaSucessoSemana = stats.fotos.totalSemana > 0 
    ? ((stats.fotos.sucessoSemana / stats.fotos.totalSemana) * 100).toFixed(2)
    : 0;

  // Gerar HTML dos lotes processados na semana
  const htmlLotesProcessados = stats.lotes.detalhesProcessadosSemana.length > 0
    ? stats.lotes.detalhesProcessadosSemana.map(lote => `
        <div class="lote-card">
          <div class="lote-header">
            <strong>📦 ${lote.nome}</strong>
            <span class="badge success">Concluído</span>
          </div>
          <div class="lote-body">
            <div class="lote-stat">
              <span>Total de fotos:</span>
              <strong>${lote.totalFotos.toLocaleString('pt-BR')}</strong>
            </div>
            <div class="lote-stat">
              <span>✅ Sucesso:</span>
              <strong>${lote.fotosSucesso.toLocaleString('pt-BR')}</strong>
            </div>
            <div class="lote-stat">
              <span>❌ Falhas:</span>
              <strong>${lote.fotosFalha.toLocaleString('pt-BR')}</strong>
            </div>
            ${lote.fotosWarning > 0 ? `
            <div class="lote-stat">
              <span>⚠️ Avisos:</span>
              <strong>${lote.fotosWarning.toLocaleString('pt-BR')}</strong>
            </div>
            ` : ''}
            <div class="lote-stat">
              <span>⏱️ Tempo:</span>
              <strong>${lote.tempoProcessamento} min</strong>
            </div>
            <div class="lote-stat">
              <span>📅 Concluído em:</span>
              <strong>${new Date(lote.dataConclusao).toLocaleDateString('pt-BR')}</strong>
            </div>
          </div>
        </div>
      `).join('')
    : '<p style="text-align: center; color: #999;">Nenhum lote processado esta semana</p>';

  // Gerar HTML dos lotes aguardando
  const htmlLotesAguardando = stats.lotes.detalhesAguardando.length > 0
    ? stats.lotes.detalhesAguardando.map(lote => `
        <div class="lote-card">
          <div class="lote-header">
            <strong>📦 ${lote.nome}</strong>
            <span class="badge ${lote.status === 'processando' ? 'info' : 'warning'}">${
              lote.status === 'processando' ? 'Processando' : 'Pendente'
            }</span>
          </div>
          <div class="lote-body">
            <div class="lote-stat">
              <span>Total de fotos:</span>
              <strong>${lote.totalFotos.toLocaleString('pt-BR')}</strong>
            </div>
            <div class="lote-stat">
              <span>✅ Processadas:</span>
              <strong>${lote.fotosProcessadas.toLocaleString('pt-BR')}</strong>
            </div>
            <div class="lote-stat">
              <span>⏳ Pendentes:</span>
              <strong>${lote.fotosPendentes.toLocaleString('pt-BR')}</strong>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${lote.percentualConcluido}%"></div>
            </div>
            <div class="lote-stat">
              <span>Progresso:</span>
              <strong>${lote.percentualConcluido}%</strong>
            </div>
          </div>
        </div>
      `).join('')
    : '<p style="text-align: center; color: #999;">Nenhum lote aguardando processamento</p>';

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
      max-width: 800px;
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
      margin: 5px 0;
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
    .lote-card {
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin-bottom: 15px;
      overflow: hidden;
    }
    .lote-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .lote-body {
      padding: 20px;
    }
    .lote-stat {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .lote-stat:last-child {
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
      background: #4facfe;
      color: white;
    }
    .progress-bar {
      width: 100%;
      height: 10px;
      background: #e0e0e0;
      border-radius: 5px;
      overflow: hidden;
      margin: 10px 0;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #11998e 0%, #38ef7d 100%);
      transition: width 0.3s ease;
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
    <h1>📊 Relatório Semanal - ProjLuz</h1>
    <p>Período: ${stats.periodo.inicio} a ${stats.periodo.fim}</p>
    <p>${stats.periodo.dataGeracao}</p>
  </div>
  
  <div class="container">
    <!-- RESUMO GERAL DOS LOTES -->
    <div class="section">
      <div class="section-title">
        <span class="icon">📦</span>
        Resumo Geral de Lotes
      </div>
      
      <div class="stats-grid">
        <div class="stat-card primary">
          <div class="stat-label">Total Registrados</div>
          <div class="stat-value">${stats.lotes.totalRegistrados}</div>
        </div>
        
        <div class="stat-card success">
          <div class="stat-label">Total Processados</div>
          <div class="stat-value">${stats.lotes.totalProcessados}</div>
        </div>
        
        <div class="stat-card warning">
          <div class="stat-label">Aguardando</div>
          <div class="stat-value">${stats.lotes.totalAguardando}</div>
        </div>
      </div>
    </div>

    <!-- LOTES PROCESSADOS NA SEMANA -->
    <div class="section">
      <div class="section-title">
        <span class="icon">✅</span>
        Lotes Processados Esta Semana (${stats.lotes.processadosSemana})
      </div>
      
      ${htmlLotesProcessados}
      
      ${stats.fotos.totalSemana > 0 ? `
      <div style="margin-top: 20px; padding: 20px; background: #e8f5e9; border-radius: 8px;">
        <h3 style="margin: 0 0 15px 0; color: #2e7d32;">📸 Total de Fotos Processadas na Semana</h3>
        <div class="stats-grid">
          <div class="stat-card" style="background: white;">
            <div class="stat-label">Total</div>
            <div class="stat-value" style="font-size: 28px;">${stats.fotos.totalSemana.toLocaleString('pt-BR')}</div>
          </div>
          <div class="stat-card" style="background: white;">
            <div class="stat-label">Sucesso</div>
            <div class="stat-value" style="font-size: 28px; color: #38ef7d;">${stats.fotos.sucessoSemana.toLocaleString('pt-BR')}</div>
            <div class="stat-label">${taxaSucessoSemana}%</div>
          </div>
          <div class="stat-card" style="background: white;">
            <div class="stat-label">Falhas</div>
            <div class="stat-value" style="font-size: 28px; color: #f5576c;">${stats.fotos.falhaSemana.toLocaleString('pt-BR')}</div>
          </div>
        </div>
      </div>
      ` : ''}
    </div>

    <!-- LOTES AGUARDANDO PROCESSAMENTO -->
    <div class="section">
      <div class="section-title">
        <span class="icon">⏳</span>
        Lotes Aguardando Processamento (${stats.lotes.totalAguardando})
      </div>
      
      ${htmlLotesAguardando}
    </div>

    <div class="footer">
      <p>ProjLuz v2.0 - Sistema de Processamento Automático</p>
      <p>Este é um email automático enviado toda sexta-feira às 15:00</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Envia email de relatório semanal
 */
async function enviarRelatorioSemanal() {
  try {
    logger.info('');
    logger.info('═══════════════════════════════════════════════');
    logger.info('📧 Enviando relatório semanal');
    logger.info('═══════════════════════════════════════════════');

    // Gerar estatísticas
    const stats = await gerarRelatorioSemanal();

    // Gerar HTML
    const html = gerarHtmlRelatorioSemanal(stats);

    // Enviar email
    const { Resend } = require('resend');
    const resend = new Resend(emailConfig.apiKey);

    // Pegar destinatários do .env
    const destinatarios = process.env.EMAIL_TO 
      ? process.env.EMAIL_TO.split(',').map(email => email.trim())
      : ['contact@marangonijunior.co.uk'];

    const resultado = await resend.emails.send({
      from: emailConfig.from,
      to: destinatarios,
      subject: `📊 Relatório Semanal ProjLuz - ${stats.periodo.inicio} a ${stats.periodo.fim}`,
      html
    });

    logger.info('✅ Relatório semanal enviado com sucesso!');
    logger.info(`   Destinatários: ${destinatarios.join(', ')}`);
    logger.info(`   Email ID: ${resultado.data?.id || 'N/A'}`);
    logger.info('');

    return { sucesso: true, emailId: resultado.data?.id };

  } catch (error) {
    logger.error('❌ Erro ao enviar relatório semanal:', error);
    throw error;
  }
}

module.exports = {
  gerarRelatorioSemanal,
  enviarRelatorioSemanal
};
