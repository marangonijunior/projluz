const express = require('express');
const router = express.Router();
const loteController = require('../controllers/loteController');

// Estatísticas gerais do sistema
router.get('/', loteController.estatisticas.bind(loteController));

module.exports = router;
