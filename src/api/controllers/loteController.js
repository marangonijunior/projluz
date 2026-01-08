const Lote = require('../../models/Lote');
const Foto = require('../../models/Foto');
const { arrayToCsvString } = require('../../services/csvService');
const logger = require('../../services/logger');

class LoteController {
  // GET /api/lotes - Lista todos os lotes
  async listar(req, res) {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      
      const query = status ? { status } : {};
      const skip = (page - 1) * limit;
      
      const lotes = await Lote.find(query)
        .sort({ dataImportacao: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-erros'); // Não retornar array de erros na listagem
      
      const total = await Lote.countDocuments(query);
      
      res.json({
        lotes,
        paginacao: {
          paginaAtual: parseInt(page),
          totalPaginas: Math.ceil(total / limit),
          totalRegistros: total,
          registrosPorPagina: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Erro ao listar lotes:', error);
      res.status(500).json({ erro: 'Erro ao listar lotes', mensagem: error.message });
    }
  }

  // GET /api/lotes/:nome - Detalhes de um lote
  async buscarPorNome(req, res) {
    try {
      const { nome } = req.params;
      
      const lote = await Lote.findOne({ nome });
      
      if (!lote) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
      res.json(lote);
    } catch (error) {
      logger.error('Erro ao buscar lote:', error);
      res.status(500).json({ erro: 'Erro ao buscar lote', mensagem: error.message });
    }
  }

  // GET /api/lotes/:nome/export - Exportar CSV do lote
  async exportarCsv(req, res) {
    try {
      const { nome } = req.params;
      
      // Buscar fotos pelo campo 'lote' (novo sistema)
      const fotos = await Foto.find({ lote: nome })
        .select('cid httpUrl numeroEncontrado confidencialidade status')
        .sort({ cid: 1 });
      
      if (!fotos || fotos.length === 0) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
      // Formatar dados para CSV
      const dados = fotos.map(foto => ({
        cid: foto.cid,
        link_foto: foto.httpUrl,
        numero_encontrado: String(foto.numeroEncontrado || ''), // SEMPRE STRING para preservar zeros
        confidencialidade: foto.confidencialidade ? foto.confidencialidade.toFixed(2) : '',
        status: foto.status
      }));
      
      const csv = arrayToCsvString(dados);
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="resultado_${nome}.csv"`);
      res.send(csv);
      
    } catch (error) {
      logger.error('Erro ao exportar CSV:', error);
      res.status(500).json({ erro: 'Erro ao exportar CSV', mensagem: error.message });
    }
  }

  // GET /api/lotes/:nome/fotos - Listar fotos do lote
  async listarFotos(req, res) {
    try {
      const { nome } = req.params;
      const { status, page = 1, limit = 50 } = req.query;
      
      const query = { lote: nome };
      if (status) query.status = status;
      
      const skip = (page - 1) * limit;
      
      const fotos = await Foto.find(query)
        .sort({ cid: 1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      const total = await Foto.countDocuments(query);
      
      if (total === 0) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
      res.json({
        fotos,
        paginacao: {
          paginaAtual: parseInt(page),
          totalPaginas: Math.ceil(total / limit),
          totalRegistros: total,
          registrosPorPagina: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Erro ao listar fotos:', error);
      res.status(500).json({ erro: 'Erro ao listar fotos', mensagem: error.message });
    }
  }

  // POST /api/lotes/:nome/processar - Iniciar processamento do lote
  async processar(req, res) {
    try {
      const { nome } = req.params;
      
      // Verificar se o lote existe
      const totalFotos = await Foto.countDocuments({ lote: nome });
      
      if (totalFotos === 0) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
      // Verificar se há fotos processando
      const processando = await Foto.countDocuments({ lote: nome, status: 'processando' });
      if (processando > 0) {
        return res.status(400).json({ erro: 'Lote já está sendo processado' });
      }
      
      // Verificar se há fotos pendentes
      const pendentes = await Foto.countDocuments({ lote: nome, status: 'pendente' });
      if (pendentes === 0) {
        return res.status(400).json({ erro: 'Nenhuma foto pendente para processar' });
      }
      
      // Disparar processamento assíncrono
      const { processarLotePendente } = require('../../controllers/loteProcessor');
      processarLotePendente(nome).catch(err => {
        logger.error('Erro no processamento do lote:', err);
      });
      
      res.json({ 
        mensagem: 'Processamento iniciado',
        lote: {
          nome,
          totalFotos,
          pendentes
        }
      });
    } catch (error) {
      logger.error('Erro ao iniciar processamento:', error);
      res.status(500).json({ erro: 'Erro ao iniciar processamento', mensagem: error.message });
    }
  }

  // GET /api/lotes/:nome/status - Obter status do processamento
  async obterStatus(req, res) {
    try {
      const { nome } = req.params;
      
      // Buscar estatísticas do lote
      const stats = await Foto.aggregate([
        { $match: { lote: nome } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
      
      if (!stats || stats.length === 0) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
      // Formatar estatísticas
      const statusMap = {};
      let total = 0;
      
      stats.forEach(s => {
        statusMap[s._id] = s.count;
        total += s.count;
      });
      
      res.json({
        nome,
        total,
        pendente: statusMap.pendente || 0,
        processando: statusMap.processando || 0,
        sucesso: statusMap.sucesso || 0,
        falha: statusMap.falha || 0,
        erro: statusMap.erro || 0,
        warning: statusMap.warning || 0
      });
      
      const statusDetalhado = {
        nome: lote.nome,
        status: lote.status,
        totalFotos: lote.totalFotos,
        fotosProcessadas: lote.fotosSucesso + lote.fotosFalha,
        fotosSucesso: lote.fotosSucesso,
        fotosFalha: lote.fotosFalha,
        fotosPendentes: lote.fotosPendentes,
        fotosProcessando: lote.fotosProcessando,
        fotosWarning: await Foto.countDocuments({ loteId: lote._id, status: 'warning' }),
        percentualSucesso: lote.percentualSucesso,
        percentualFalha: lote.percentualFalha,
        percentualConcluido: lote.totalFotos > 0 
          ? ((lote.fotosSucesso + lote.fotosFalha) / lote.totalFotos * 100).toFixed(2)
          : 0,
        custoEstimado: lote.custoEstimadoAWS,
        custoReal: lote.custoRealAWS,
        tempoDecorrido: lote.dataInicio 
          ? Math.round((Date.now() - lote.dataInicio.getTime()) / 1000)
          : 0,
        tempoTotal: lote.tempoTotalProcessamento,
        tempoMedioPorFoto: lote.tempoMedioPorFoto,
        dataImportacao: lote.dataImportacao,
        dataInicio: lote.dataInicio,
        dataConclusao: lote.dataConclusao
      };
      
      res.json(statusDetalhado);
    } catch (error) {
      logger.error('Erro ao obter status:', error);
      res.status(500).json({ erro: 'Erro ao obter status', mensagem: error.message });
    }
  }

  // GET /api/estatisticas - Estatísticas gerais
  async estatisticas(req, res) {
    try {
      const totalLotes = await Lote.countDocuments();
      const lotesProcessando = await Lote.countDocuments({ status: 'processando' });
      const lotesConcluidos = await Lote.countDocuments({ status: 'concluido' });
      const lotesErro = await Lote.countDocuments({ status: 'erro' });
      
      const totalFotos = await Foto.countDocuments();
      const fotosSucesso = await Foto.countDocuments({ status: 'sucesso' });
      const fotosFalha = await Foto.countDocuments({ status: 'falha' });
      const fotosPendentes = await Foto.countDocuments({ status: 'pendente' });
      const fotosWarning = await Foto.countDocuments({ status: 'warning' });
      
      // Custo total
      const resultadoCusto = await Lote.aggregate([
        { $group: {
          _id: null,
          custoTotal: { $sum: '$custoRealAWS' },
          custoEstimadoTotal: { $sum: '$custoEstimadoAWS' }
        }}
      ]);
      
      const custos = resultadoCusto[0] || { custoTotal: 0, custoEstimadoTotal: 0 };
      
      // Últimos lotes
      const ultimosLotes = await Lote.find()
        .sort({ dataImportacao: -1 })
        .limit(5)
        .select('nome status totalFotos fotosSucesso dataImportacao');
      
      res.json({
        lotes: {
          total: totalLotes,
          processando: lotesProcessando,
          concluidos: lotesConcluidos,
          erro: lotesErro
        },
        fotos: {
          total: totalFotos,
          sucesso: fotosSucesso,
          falha: fotosFalha,
          pendentes: fotosPendentes,
          warning: fotosWarning,
          taxaSucesso: totalFotos > 0 ? (fotosSucesso / totalFotos * 100).toFixed(2) : 0
        },
        custos: {
          real: custos.custoTotal.toFixed(4),
          estimado: custos.custoEstimadoTotal.toFixed(4),
          economia: (custos.custoEstimadoTotal - custos.custoTotal).toFixed(4)
        },
        ultimosLotes
      });
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error);
      res.status(500).json({ erro: 'Erro ao obter estatísticas', mensagem: error.message });
    }
  }

  // GET /api/lotes/:nome/warnings - Listar fotos que requerem revisão
  async listarWarnings(req, res) {
    try {
      const { nome } = req.params;
      const { page = 1, limit = 50 } = req.query;
      
      const lote = await Lote.findOne({ nome });
      
      if (!lote) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
      const query = { 
        loteId: lote._id,
        status: 'warning',
        requerRevisao: true
      };
      
      const skip = (page - 1) * limit;
      
      const fotos = await Foto.find(query)
        .sort({ confidencialidade: -1 }) // Ordenar por confiança (maior primeiro)
        .skip(skip)
        .limit(parseInt(limit))
        .select('idPrisma linkFotoOriginal numeroEncontrado confidencialidade numerosAlternativos');
      
      const total = await Foto.countDocuments(query);
      
      res.json({
        fotos: fotos.map(foto => ({
          idPrisma: foto.idPrisma,
          linkFoto: foto.linkFotoOriginal,
          numeroPrincipal: {
            numero: foto.numeroEncontrado,
            confidencialidade: foto.confidencialidade
          },
          numerosAlternativos: foto.numerosAlternativos,
          totalAlternativas: foto.numerosAlternativos.length
        })),
        paginacao: {
          paginaAtual: parseInt(page),
          totalPaginas: Math.ceil(total / limit),
          totalRegistros: total,
          registrosPorPagina: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Erro ao listar warnings:', error);
      res.status(500).json({ erro: 'Erro ao listar warnings', mensagem: error.message });
    }
  }

  // POST /api/lotes/:nome/enviar-email - Enviar email com resumo do lote
  async enviarEmail(req, res) {
    try {
      const { nome } = req.params;
      
      // Buscar estatísticas do lote
      const stats = await Foto.aggregate([
        { $match: { lote: nome } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
      
      if (!stats || stats.length === 0) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
      // Formatar estatísticas
      const statusMap = {};
      let total = 0;
      
      stats.forEach(s => {
        statusMap[s._id] = s.count;
        total += s.count;
      });
      
      const sucesso = statusMap.sucesso || 0;
      const falhas = (statusMap.falha || 0) + (statusMap.erro || 0);
      
      // Preparar dados para o email
      const emailStats = {
        batchName: nome,
        total,
        success: sucesso,
        failures: falhas,
        duration: 0,
        timestamp: new Date().toLocaleString('pt-BR')
      };
      
      // Enviar email
      const { sendSummaryEmail } = require('../../services/emailService');
      const enviado = await sendSummaryEmail(emailStats);
      
      if (!enviado) {
        return res.status(500).json({ erro: 'Falha ao enviar email. Verifique as configurações (RESEND_API_KEY, EMAIL_TO)' });
      }
      
      res.json({ 
        mensagem: 'Email enviado com sucesso',
        lote: nome,
        estatisticas: {
          total,
          sucesso,
          falhas,
          pendente: statusMap.pendente || 0
        }
      });
      
    } catch (error) {
      logger.error('Erro ao enviar email:', error);
      res.status(500).json({ erro: 'Erro ao enviar email', mensagem: error.message });
    }
  }
}

module.exports = new LoteController();
