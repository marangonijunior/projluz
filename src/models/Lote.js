const mongoose = require('mongoose');

const LoteSchema = new mongoose.Schema({
  // Identificação
  nome: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  driveFileId: {
    type: String,
    required: true
  },
  driveFileName: {
    type: String,
    required: true
  },
  
  // Controle de Status
  status: {
    type: String,
    enum: ['pendente', 'importando', 'processando', 'concluido', 'erro'],
    default: 'pendente',
    index: true
  },
  
  // Timestamps
  dataImportacao: {
    type: Date,
    default: Date.now,
    index: true
  },
  dataInicioProcessamento: Date,
  dataConclusaoProcessamento: Date,
  
  // Estatísticas
  totalFotos: {
    type: Number,
    default: 0
  },
  fotosImportadas: {
    type: Number,
    default: 0
  },
  fotosPendentes: {
    type: Number,
    default: 0
  },
  fotosProcessando: {
    type: Number,
    default: 0
  },
  fotosSucesso: {
    type: Number,
    default: 0
  },
  fotosFalha: {
    type: Number,
    default: 0
  },
  
  // Controle de Custos AWS
  custoEstimadoAWS: {
    type: Number,
    default: 0
  },
  custoRealAWS: {
    type: Number,
    default: 0
  },
  
  // Performance
  tempoTotalProcessamento: Number, // em segundos
  tempoMedioPorFoto: Number,       // em segundos
  
  // Metadados
  hashArquivo: {
    type: String,
    unique: true,
    index: true,
    required: true
  },
  tamanhoArquivo: Number, // bytes
  
  // Auditoria
  erros: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    mensagem: String,
    stack: String,
    tipo: String
  }]
}, {
  timestamps: true
});

// Índices compostos
LoteSchema.index({ status: 1, dataImportacao: -1 });

// Métodos virtuais
LoteSchema.virtual('percentualSucesso').get(function() {
  if (this.totalFotos === 0) return 0;
  return ((this.fotosSucesso / this.totalFotos) * 100).toFixed(2);
});

LoteSchema.virtual('percentualFalha').get(function() {
  if (this.totalFotos === 0) return 0;
  return ((this.fotosFalha / this.totalFotos) * 100).toFixed(2);
});

// Métodos de instância
LoteSchema.methods.iniciarProcessamento = function() {
  this.status = 'processando';
  this.dataInicioProcessamento = new Date();
  return this.save();
};

LoteSchema.methods.concluirProcessamento = function() {
  this.status = 'concluido';
  this.dataConclusaoProcessamento = new Date();
  
  if (this.dataInicioProcessamento) {
    this.tempoTotalProcessamento = 
      (this.dataConclusaoProcessamento - this.dataInicioProcessamento) / 1000;
    
    if (this.totalFotos > 0) {
      this.tempoMedioPorFoto = this.tempoTotalProcessamento / this.totalFotos;
    }
  }
  
  return this.save();
};

LoteSchema.methods.registrarErro = function(erro) {
  this.erros.push({
    mensagem: erro.message,
    stack: erro.stack,
    tipo: erro.tipo || 'desconhecido'
  });
  
  if (this.erros.length > 100) {
    this.erros = this.erros.slice(-100);
  }
  
  return this.save();
};

// Configurar toJSON para incluir virtuals
LoteSchema.set('toJSON', { virtuals: true });
LoteSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Lote', LoteSchema);
