const express = require('express');
const router = express.Router();
const loteController = require('../controllers/loteController');

// Listar todos os lotes
// Query params: ?status=pendente&page=1&limit=20
router.get('/', loteController.listar.bind(loteController));

// Detalhes de um lote específico
router.get('/:nome', loteController.buscarPorNome.bind(loteController));

// Exportar CSV do lote
router.get('/:nome/export', loteController.exportarCsv.bind(loteController));

// Listar fotos de um lote
// Query params: ?status=sucesso&page=1&limit=50
router.get('/:nome/fotos', loteController.listarFotos.bind(loteController));

// Iniciar processamento do lote
router.post('/:nome/processar', loteController.processar.bind(loteController));

// Obter status do processamento em tempo real
router.get('/:nome/status', loteController.obterStatus.bind(loteController));

// Listar fotos que requerem revisão (warning)
router.get('/:nome/warnings', loteController.listarWarnings.bind(loteController));

module.exports = router;
