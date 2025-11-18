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
      
      const lote = await Lote.findOne({ nome });
      
      if (!lote) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
      const fotos = await Foto.find({ loteId: lote._id })
        .select('idPrisma linkFotoOriginal numeroEncontrado confidencialidade status')
        .sort({ idPrisma: 1 });
      
      // Formatar dados para CSV
      const dados = fotos.map(foto => ({
        id: foto.idPrisma,
        link_foto_plaqueta: foto.linkFotoOriginal,
        numero_encontrado: String(foto.numeroEncontrado || ''), // SEMPRE STRING para preservar zeros
        confidencialidade: foto.confidencialidade ? foto.confidencialidade.toFixed(2) : '',
        falhou: foto.status === 'falha' ? 'true' : 'false'
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
      
      const lote = await Lote.findOne({ nome });
      
      if (!lote) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
      const query = { loteId: lote._id };
      if (status) query.status = status;
      
      const skip = (page - 1) * limit;
      
      const fotos = await Foto.find(query)
        .sort({ idPrisma: 1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      const total = await Foto.countDocuments(query);
      
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
      
      const lote = await Lote.findOne({ nome });
      
      if (!lote) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
      if (lote.status === 'processando') {
        return res.status(400).json({ erro: 'Lote já está sendo processado' });
      }
      
      if (lote.status === 'concluido') {
        return res.status(400).json({ erro: 'Lote já foi processado' });
      }
      
      // Iniciar processamento (será feito em background)
      await lote.iniciarProcessamento();
      
      // Disparar processamento assíncrono
      const batchProcessor = require('../../controllers/batchProcessor');
      batchProcessor.processLote(lote._id).catch(err => {
        logger.error('Erro no processamento do lote:', err);
      });
      
      res.json({ 
        mensagem: 'Processamento iniciado',
        lote: {
          nome: lote.nome,
          status: lote.status,
          totalFotos: lote.totalFotos
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
      
      const lote = await Lote.findOne({ nome });
      
      if (!lote) {
        return res.status(404).json({ erro: 'Lote não encontrado' });
      }
      
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
}

module.exports = new LoteController();
