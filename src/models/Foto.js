const mongoose = require('mongoose');

const FotoSchema = new mongoose.Schema({
  // Relacionamento
  loteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lote',
    required: true,
    index: true
  },
  loteNome: {
    type: String,
    required: true,
    index: true
  },
  
  // Identificação
  idPrisma: {
    type: String,
    required: true,
    index: true
  },
  linkFotoOriginal: {
    type: String,
    required: true
  },
  driveFileId: String,
  ftpPath: String, // Caminho da foto no FTP (sistema híbrido)
  
  // Controle de Duplicidade
  hashFoto: {
    type: String,
    unique: true,
    sparse: true, // permite null, mas se existir deve ser único
    index: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['pendente', 'processando', 'sucesso', 'falha', 'ignorada', 'warning'],
    default: 'pendente',
    index: true
  },
  
  // Flag de atenção (múltiplos números encontrados)
  requerRevisao: {
    type: Boolean,
    default: false
  },
  
  // Números alternativos encontrados (quando há múltiplos)
  numerosAlternativos: [{
    numero: String,
    confidencialidade: Number
  }],
  
  // Resultados AWS Rekognition
  numeroEncontrado: {
    type: String,  // SEMPRE String para preservar zeros à esquerda (ex: "012345")
    default: ''
  },
  confidencialidade: Number,
  textoCompleto: String,
  
  // Controle de Tentativas
  tentativas: {
    type: Number,
    default: 0
  },
  maxTentativas: {
    type: Number,
    default: 3
  },
  
  // Timestamps
  dataImportacao: {
    type: Date,
    default: Date.now
  },
  dataUltimaProcessamento: Date,
  dataProcessamentoSucesso: Date,
  
  // Performance
  tempoDownload: Number,        // ms
  tempoProcessamentoAWS: Number, // ms
  tempoTotal: Number,            // ms
  tamanhoImagem: Number,         // bytes
  
  // Custos
  custoAWS: {
    type: Number,
    default: 0.001
  },
  
  // Erros e Logs
  ultimoErro: {
    mensagem: String,
    timestamp: Date,
    stack: String,
    tipo: String // 'download', 'aws', 'validacao'
  },
  
  historicoErros: [{
    tentativa: Number,
    mensagem: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Validações
  validacoes: {
    urlValida: Boolean,
    imagemBaixada: Boolean,
    tamanhoAceitavel: Boolean,
    numeroValido: Boolean,
    confidenciaMinima: Boolean
  }
}, {
  timestamps: true
});

// Índices compostos
FotoSchema.index({ loteId: 1, status: 1 });
FotoSchema.index({ loteId: 1, idPrisma: 1 }, { unique: true });
FotoSchema.index({ status: 1, dataImportacao: 1 });
FotoSchema.index({ loteNome: 1, numeroEncontrado: 1 });

// Métodos de instância
FotoSchema.methods.iniciarProcessamento = function() {
  this.status = 'processando';
  this.tentativas += 1;
  this.dataUltimaProcessamento = new Date();
  return this.save();
};

FotoSchema.methods.marcarSucesso = function(resultado) {
  this.status = 'sucesso';
  this.numeroEncontrado = resultado.numero;
  this.confidencialidade = resultado.confidencialidade;
  this.textoCompleto = resultado.textoCompleto;
  this.dataProcessamentoSucesso = new Date();
  this.requerRevisao = false;
  this.numerosAlternativos = [];
  
  this.validacoes = {
    urlValida: true,
    imagemBaixada: true,
    tamanhoAceitavel: true,
    numeroValido: true,
    confidenciaMinima: resultado.confidencialidade >= 95
  };
  
  return this.save();
};

FotoSchema.methods.marcarWarning = function(resultado) {
  this.status = 'warning';
  this.numeroEncontrado = resultado.numero; // Número com maior confiança
  this.confidencialidade = resultado.confidencialidade;
  this.textoCompleto = resultado.textoCompleto;
  this.requerRevisao = true;
  this.numerosAlternativos = resultado.numerosAlternativos || [];
  this.dataUltimaProcessamento = new Date();
  
  this.validacoes = {
    urlValida: true,
    imagemBaixada: true,
    tamanhoAceitavel: true,
    numeroValido: true,
    confidenciaMinima: resultado.confidencialidade >= 95
  };
  
  return this.save();
};

FotoSchema.methods.marcarFalha = function(erro) {
  this.status = 'falha';
  
  this.ultimoErro = {
    mensagem: erro.message,
    timestamp: new Date(),
    stack: erro.stack,
    tipo: erro.tipo || 'desconhecido'
  };
  
  this.historicoErros.push({
    tentativa: this.tentativas,
    mensagem: erro.message
  });
  
  // Limitar histórico a 10 erros
  if (this.historicoErros.length > 10) {
    this.historicoErros = this.historicoErros.slice(-10);
  }
  
  return this.save();
};

FotoSchema.methods.podeReprocessar = function() {
  return this.tentativas < this.maxTentativas && this.status !== 'sucesso';
};

// Métodos estáticos
FotoSchema.statics.buscarPendentes = function(loteId, limit = 10) {
  return this.find({
    loteId,
    status: 'pendente'
  })
  .limit(limit)
  .sort({ dataImportacao: 1 });
};

FotoSchema.statics.contarPorStatus = function(loteId) {
  return this.aggregate([
    { $match: { loteId } },
    { $group: {
      _id: '$status',
      count: { $sum: 1 }
    }}
  ]);
};

module.exports = mongoose.model('Foto', FotoSchema);
