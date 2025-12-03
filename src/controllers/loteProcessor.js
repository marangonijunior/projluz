const Lote = require('../models/Lote');
const Foto = require('../models/Foto');
const { downloadFile } = require('../services/driveService');
const { extractNumberFromImage } = require('../services/rekognitionService');
const { sendSummaryEmail } = require('../services/emailService');
const logger = require('../services/logger');

// ✅ Lock global para evitar execuções simultâneas do CRON
let isProcessing = false;
let currentExecutionStart = null;

/**
 * Extrai file_id da URL do Google Drive
 */
function extractFileId(url) {
  const matches = url.match(/[-\w]{25,}/);
  return matches ? matches[0] : null;
}

/**
 * Processa uma única foto
 */
async function processarFoto(foto) {
  const inicio = Date.now();
  
  try {
    // Extrair file_id da URL
    const fileId = extractFileId(foto.linkFotoOriginal);
    if (!fileId) {
      throw new Error('URL inválida - não foi possível extrair file_id');
    }

    // Baixar imagem do Drive
    logger.debug(`📥 Baixando foto: ${foto.idPrisma}`);
    const imageBuffer = await downloadFile(fileId);

    // Analisar com AWS Rekognition
    logger.debug(`🔍 Analisando foto: ${foto.idPrisma}`);
    const resultado = await extractNumberFromImage(imageBuffer);

    // Atualizar foto com resultado
    foto.numeroEncontrado = resultado.number || '';
    foto.confidencialidade = resultado.confidence || 0;
    foto.textoCompleto = resultado.reason || '';
    foto.status = resultado.success ? 'sucesso' : (resultado.status === 'warning' ? 'warning' : 'falha');
    foto.custoAWS = 0.001;
    foto.tempoTotal = Date.now() - inicio;
    foto.dataProcessamento = new Date();

    if (!resultado.success && resultado.reason) {
      foto.motivoWarning = resultado.reason;
    }

    if (resultado.alternativeNumbers && resultado.alternativeNumbers.length > 0) {
      foto.numerosAlternativos = resultado.alternativeNumbers;
    }

    await foto.save();

    logger.info(`✅ ${foto.idPrisma}: ${resultado.number || 'N/A'} (${resultado.confidence}%)`);
    
    return { sucesso: true, foto };

  } catch (error) {
    // Incrementar tentativas
    foto.tentativas = (foto.tentativas || 0) + 1;
    foto.ultimoErro = {
      mensagem: error.message,
      timestamp: new Date()
    };

    // Se excedeu tentativas, marcar como falha
    if (foto.tentativas >= 3) {
      foto.status = 'falha';
      logger.error(`❌ ${foto.idPrisma}: Falha após 3 tentativas - ${error.message}`);
    } else {
      foto.status = 'pendente';
      logger.warn(`⚠️  ${foto.idPrisma}: Tentativa ${foto.tentativas}/3 falhou - ${error.message}`);
    }

    foto.tempoTotal = Date.now() - inicio;
    await foto.save();

    return { sucesso: false, erro: error.message };
  }
}

/**
 * Processa um lote completo
 */
async function processarLote(lote) {
  const inicioLote = Date.now();
  
  try {
    logger.info('');
    logger.info(`═══════════════════════════════════════════════`);
    logger.info(`📦 Processando lote: ${lote.nome}`);
    logger.info(`═══════════════════════════════════════════════`);

    // Atualizar status do lote
    lote.status = 'processando';
    lote.dataInicio = new Date();
    await lote.save();

    // Processar TODAS as fotos pendentes em loop (10 por vez)
    let totalProcessadas = 0;
    let totalSucessos = 0;
    let totalFalhas = 0;
    
    while (true) {
      // Buscar próximo lote de 10 fotos pendentes
      const fotosPendentes = await Foto.find({
        loteId: lote._id,
        status: 'pendente'
      }).limit(10);

      if (fotosPendentes.length === 0) {
        // Não há mais fotos pendentes
        break;
      }

      logger.info(`🔄 Processando ${fotosPendentes.length} fotos...`);

      let sucessos = 0;
      let falhas = 0;

      // Processar fotos uma por uma
      for (const foto of fotosPendentes) {
        const resultado = await processarFoto(foto);
        if (resultado.sucesso) {
          sucessos++;
        } else {
          falhas++;
        }

        // Pequeno delay para não sobrecarregar APIs
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      totalProcessadas += fotosPendentes.length;
      totalSucessos += sucessos;
      totalFalhas += falhas;

      logger.info(`📊 Progresso: ${totalProcessadas} processadas (✅ ${sucessos} | ❌ ${falhas})`);
    }

    // Todas as fotos foram processadas
    logger.info('');
    logger.info('✅ Todas as fotos do lote foram processadas!');
    
    // Atualizar estatísticas finais do lote
    const todasFotos = await Foto.find({ loteId: lote._id });
    lote.fotosSucesso = todasFotos.filter(f => f.status === 'sucesso').length;
    lote.fotosFalha = todasFotos.filter(f => f.status === 'falha').length;
    lote.fotosWarning = todasFotos.filter(f => f.status === 'warning').length;
    lote.custoRealAWS = todasFotos.reduce((acc, f) => acc + (f.custoAWS || 0), 0);
    lote.status = 'concluido';
    lote.dataConclusao = new Date();
    lote.tempoTotalProcessamento = Date.now() - new Date(lote.dataInicio).getTime();
    
    await lote.save();

    const tempoTotal = (Date.now() - inicioLote) / 1000;
    logger.info(`⏱️  Tempo total: ${tempoTotal.toFixed(2)}s`);
    logger.info(`✅ Sucesso: ${lote.fotosSucesso}`);
    logger.info(`❌ Falhas: ${lote.fotosFalha}`);
    logger.info(`⚠️  Warnings: ${lote.fotosWarning}`);

    // Enviar email com resumo
    logger.info('');
    logger.info('� Enviando email de conclusão...');

    const stats = {
      batchName: lote.driveFileName || lote.nome,
      total: todasFotos.length,
      success: lote.fotosSucesso,
      failures: lote.fotosFalha + lote.fotosWarning,
      duration: lote.tempoTotalProcessamento / 1000,
      timestamp: new Date().toLocaleString('pt-BR')
    };

    await sendSummaryEmail(stats);
    logger.info('✅ Email enviado!');

    return {
      loteNome: lote.nome,
      totalFotos: todasFotos.length,
      sucesso: lote.fotosSucesso,
      falha: lote.fotosFalha,
      warning: lote.fotosWarning,
      concluido: true
    };

  } catch (error) {
    logger.error(`❌ Erro ao processar lote ${lote.nome}:`, error);
    
    lote.status = 'erro';
    lote.ultimoErro = {
      mensagem: error.message,
      timestamp: new Date()
    };
    await lote.save();

    throw error;
  }
}

/**
 * Processa todos os lotes pendentes
 * ⚠️ Com proteção contra execuções simultâneas
 */
async function processarLotesPendentes() {
  // ⚠️ VERIFICAR SE JÁ ESTÁ PROCESSANDO
  if (isProcessing) {
    const tempoDecorrido = Math.floor((Date.now() - currentExecutionStart) / 1000 / 60);
    logger.warn('');
    logger.warn('⚠️  ════════════════════════════════════════════════');
    logger.warn('⚠️  PROCESSAMENTO JÁ EM ANDAMENTO');
    logger.warn(`⚠️  Iniciado há ${tempoDecorrido} minuto(s)`);
    logger.warn('⚠️  Pulando esta execução do CRON');
    logger.warn('⚠️  ════════════════════════════════════════════════');
    logger.warn('');
    
    return {
      sucesso: false,
      motivo: 'processamento_em_andamento',
      tempoDecorrido: `${tempoDecorrido}min`,
      lotesProcessados: 0,
      totalFotos: 0,
      fotosSucesso: 0,
      fotosFalha: 0
    };
  }

  try {
    // ✅ ATIVAR LOCK
    isProcessing = true;
    currentExecutionStart = Date.now();
    
    logger.info('🔒 Lock ativado - Processamento iniciado');
    
    // Buscar lotes pendentes ou em processamento
    const lotesPendentes = await Lote.find({
      status: { $in: ['pendente', 'processando'] }
    }).sort({ dataCriacao: 1 });

    if (lotesPendentes.length === 0) {
      logger.info('ℹ️  Nenhum lote pendente para processar');
      return {
        sucesso: true,
        lotesProcessados: 0,
        totalFotos: 0,
        fotosSucesso: 0,
        fotosFalha: 0
      };
    }

    logger.info(`📋 ${lotesPendentes.length} lote(s) pendente(s) encontrado(s)`);

    let totalFotos = 0;
    let totalSucesso = 0;
    let totalFalha = 0;
    let lotesProcessados = 0;

    // Processar cada lote
    for (const lote of lotesPendentes) {
      try {
        const resultado = await processarLote(lote);
        
        if (resultado.concluido) {
          lotesProcessados++;
        }
        
        totalFotos += resultado.totalFotos;
        totalSucesso += resultado.sucesso;
        totalFalha += resultado.falha;

      } catch (error) {
        logger.error(`Erro ao processar lote ${lote.nome}, continuando...`);
      }
    }

    const tempoTotalMin = Math.floor((Date.now() - currentExecutionStart) / 1000 / 60);
    logger.info('');
    logger.info('════════════════════════════════════════════════');
    logger.info('✅ TODOS OS LOTES PROCESSADOS');
    logger.info('════════════════════════════════════════════════');
    logger.info(`📦 Lotes: ${lotesProcessados}`);
    logger.info(`✅ Sucesso: ${totalSucesso}`);
    logger.info(`❌ Falhas: ${totalFalha}`);
    logger.info(`⏱️  Tempo total: ${tempoTotalMin} minuto(s)`);
    logger.info('════════════════════════════════════════════════');
    logger.info('');

    return {
      sucesso: true,
      lotesProcessados,
      totalFotos,
      fotosSucesso: totalSucesso,
      fotosFalha: totalFalha,
      tempoTotal: tempoTotalMin
    };

  } catch (error) {
    logger.error('Erro ao processar lotes pendentes:', error);
    throw error;
  } finally {
    // ✅ SEMPRE LIBERAR LOCK (mesmo com erro)
    const tempoTotal = Math.floor((Date.now() - (currentExecutionStart || Date.now())) / 1000 / 60);
    isProcessing = false;
    currentExecutionStart = null;
    
    logger.info(`🔓 Lock liberado após ${tempoTotal} minuto(s)`);
    logger.info('');
  }
}

module.exports = {
  processarLote,
  processarLotesPendentes,
  processarFoto
};
