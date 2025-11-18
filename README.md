# ProjLuz v2.0 - Sistema de Processamento de Imagens com MongoDB

Sistema completo de processamento de imagens usando AWS Rekognition, com banco de dados MongoDB, API REST e prevenção de duplicidades.

## 🚀 Novidades da Versão 2.0

- **MongoDB** - Banco de dados para persistência e histórico
- **API REST** - 8 endpoints para consulta e gerenciamento
- **Prevenção de Duplicidades** - Hash-based para evitar reprocessamento
- **Controle de Custos** - Monitoramento de gastos AWS em tempo real
- **Status em Tempo Real** - Acompanhamento do progresso do processamento
- **Retry Logic** - Até 3 tentativas automáticas para fotos com falha
- **Exportação via API** - Download de CSV através de endpoints HTTP

## 📋 Pré-requisitos

- Node.js 18+
- MongoDB 5.0+
- AWS Account (Rekognition)
- Google Drive API (Service Account)
- Resend API Key

## 🔧 Instalação

```bash
# Clonar repositório
git clone <repo-url>
cd projluz

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais
```

## ⚙️ Configuração

### MongoDB

```bash
# Instalar MongoDB (macOS)
brew tap mongodb/brew
brew install mongodb-community

# Iniciar MongoDB
brew services start mongodb-community

# Verificar conexão
mongosh mongodb://localhost:27017/projluz
```

### Variáveis de Ambiente

Arquivo `.env`:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/projluz

# API
API_PORT=3000

# AWS Rekognition
AWS_ACCESS_KEY_ID=seu_access_key
AWS_SECRET_ACCESS_KEY=seu_secret_key
AWS_REGION=eu-west-2

# Google Drive
FOLDER_ID=id_da_pasta_drive
GOOGLE_TYPE=service_account
GOOGLE_PROJECT_ID=seu_projeto
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
GOOGLE_CLIENT_EMAIL=service@projeto.iam.gserviceaccount.com

# Email (Resend)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=seu@email.com
EMAIL_TO=destinatario@email.com

# Processamento
MIN_CONFIDENCE=95
BATCH_SIZE=10000
```

## 🗄️ Schemas do Banco de Dados

### Lote (Batch)

```javascript
{
  nome: String,              // Nome do lote
  driveFileId: String,       // ID do arquivo no Drive
  driveFileName: String,     // Nome original do arquivo
  hashArquivo: String,       // Hash SHA256 (duplicidade)
  status: String,            // pendente | processando | concluido | erro
  totalFotos: Number,
  fotosSucesso: Number,
  fotosFalha: Number,
  custoEstimadoAWS: Number,
  custoRealAWS: Number,
  tempoTotalProcessamento: Number
}
```

### Foto (Photo)

```javascript
{
  loteId: ObjectId,          // Referência ao lote
  idPrisma: String,          // ID do sistema Prisma
  linkFotoOriginal: String,  // URL da foto
  hashFoto: String,          // Hash SHA256 (duplicidade)
  status: String,            // pendente | processando | sucesso | falha
  numeroEncontrado: String,  // Resultado do OCR
  confidencialidade: Number, // Confiança do AWS (0-100)
  tentativas: Number,        // Contador de tentativas
  custoAWS: Number,          // Custo desta foto
  tempoTotal: Number         // Tempo de processamento (ms)
}
```

## 📡 API Endpoints

### 1. Listar Lotes

```bash
GET /api/lotes
Query params: ?status=pendente&page=1&limit=20

Response:
{
  "lotes": [...],
  "paginacao": {
    "paginaAtual": 1,
    "totalPaginas": 5,
    "totalRegistros": 100
  }
}
```

### 2. Detalhes do Lote

```bash
GET /api/lotes/:nome

Response:
{
  "nome": "lote001",
  "status": "concluido",
  "totalFotos": 150,
  "fotosSucesso": 145,
  "fotosFalha": 5,
  "percentualSucesso": 96.67,
  "custoRealAWS": 0.145,
  ...
}
```

### 3. Exportar CSV

```bash
GET /api/lotes/:nome/export

Response: arquivo CSV
Content-Disposition: attachment; filename="resultado_lote001.csv"

Colunas:
- id_prisma
- link_foto_plaqueta
- numero_encontrado
- confidencialidade
- status
```

### 4. Listar Fotos do Lote

```bash
GET /api/lotes/:nome/fotos
Query params: ?status=sucesso&page=1&limit=50

Response:
{
  "fotos": [...],
  "paginacao": {...}
}
```

### 5. Processar Lote

```bash
POST /api/lotes/:nome/processar

Response:
{
  "mensagem": "Processamento iniciado",
  "lote": {
    "nome": "lote001",
    "status": "processando",
    "totalFotos": 150
  }
}
```

### 6. Status em Tempo Real

```bash
GET /api/lotes/:nome/status

Response:
{
  "nome": "lote001",
  "status": "processando",
  "fotosProcessadas": 75,
  "fotosSucesso": 70,
  "percentualConcluido": "50.00",
  "tempoDecorrido": 320,
  "custoReal": 0.075
}
```

### 7. Estatísticas Gerais

```bash
GET /api/estatisticas

Response:
{
  "lotes": {
    "total": 10,
    "concluidos": 8,
    "processando": 2
  },
  "fotos": {
    "total": 1500,
    "sucesso": 1450,
    "taxaSucesso": "96.67"
  },
  "custos": {
    "real": "1.450",
    "estimado": "1.500",
    "economia": "0.050"
  }
}
```

## 🔄 Fluxo de Trabalho

### 1. Importar Lotes

```bash
# Importar todos os CSVs da pasta do Drive
npm run import

# Ou importar lote específico
node src/scripts/importLotes.js <file_id>
```

O script:
- Lista todos os CSVs da pasta configurada
- Calcula hash de cada arquivo
- Verifica se já foi importado (duplicidade)
- Cria registro do Lote no MongoDB
- Importa fotos em lotes de 100
- Calcula hash de cada foto (URL + ID)
- Ignora fotos duplicadas

### 2. Processar Lote

```bash
# Via API
curl -X POST http://localhost:3000/api/lotes/lote001/processar

# Ou via cron (automático)
npm start
```

O processamento:
- Busca fotos pendentes do lote
- Para cada foto:
  - Verifica hash (previne duplicidade)
  - Baixa imagem do Drive
  - Envia para AWS Rekognition
  - Extrai número da plaqueta
  - Atualiza status no MongoDB
  - Registra custo e tempo
- Em caso de erro:
  - Incrementa contador de tentativas
  - Registra erro no histórico
  - Reprocessa (até 3 tentativas)
- Ao finalizar:
  - Atualiza estatísticas do lote
  - Envia email com link para download

### 3. Exportar Resultados

```bash
# Via API
curl http://localhost:3000/api/lotes/lote001/export -o resultado.csv

# Ou via web
http://localhost:3000/api/lotes/lote001/export
```

## 🏃 Comandos

```bash
# Iniciar API
npm run api

# Importar lotes
npm run import

# Processamento automático (cron)
npm start

# Desenvolvimento (watch mode)
npm run dev

# Testes
npm test
```

## 📊 Monitoramento

### Logs

Os logs são salvos em `logs/`:

```
logs/
  ├── combined.log     # Todos os logs
  ├── error.log        # Apenas erros
  └── app-YYYY-MM-DD.log
```

### MongoDB Queries

```javascript
// Listar lotes pendentes
db.lotes.find({ status: 'pendente' })

// Fotos com falha
db.fotos.find({ status: 'falha', tentativas: { $lt: 3 } })

// Custo total por lote
db.lotes.aggregate([
  { $group: { _id: null, total: { $sum: '$custoRealAWS' } } }
])

// Taxa de sucesso
db.fotos.aggregate([
  { $group: {
    _id: '$status',
    count: { $sum: 1 }
  }}
])
```

## 🔒 Prevenção de Duplicidades

### Hash de Arquivo (Lote)

```javascript
// SHA256 do conteúdo binário do CSV
hashArquivo: "a1b2c3d4..."

// Índice único no MongoDB
{ hashArquivo: 1 }, { unique: true }
```

### Hash de Foto

```javascript
// SHA256 de "idPrisma:linkFoto"
hashFoto: "e5f6g7h8..."

// Índice único
{ hashFoto: 1 }, { unique: true }
```

### Verificação na Importação

```javascript
// Antes de importar lote
const existe = await Lote.findOne({ hashArquivo });
if (existe) {
  return { sucesso: false, motivo: 'duplicado' };
}

// Antes de importar foto
const foto = await Foto.findOne({ hashFoto });
if (foto) {
  continue; // Pular esta foto
}
```

## 💰 Controle de Custos

### Estimativa

```javascript
// Custo estimado = total_fotos * $0.001
lote.custoEstimadoAWS = lote.totalFotos * 0.001;
```

### Custo Real

```javascript
// Incrementado após cada processamento
foto.custoAWS = 0.001;
lote.custoRealAWS += foto.custoAWS;
```

### Economia por Duplicidade

```javascript
// Fotos ignoradas = custo economizado
fotosIgnoradas * 0.001 = economia
```

## 🔄 Retry Logic

```javascript
// Configuração padrão
maxTentativas: 3

// Verificação antes de reprocessar
if (foto.tentativas >= foto.maxTentativas) {
  foto.status = 'falha';
} else {
  foto.tentativas++;
  // Reprocessar
}
```

## 📧 Notificações por Email

### Email com Link para Download

```javascript
{
  from: 'contact@marangonijunior.co.uk',
  to: 'destinatario@email.com',
  subject: 'Lote processado: lote001',
  html: `
    <p>O lote foi processado com sucesso!</p>
    <p><strong>Resultados:</strong></p>
    <ul>
      <li>Total: 150 fotos</li>
      <li>Sucesso: 145 (96.67%)</li>
      <li>Falha: 5</li>
    </ul>
    <p><a href="http://api.projluz.com/api/lotes/lote001/export">
      Baixar Resultado (CSV)
    </a></p>
  `
}
```

## 🐛 Troubleshooting

### MongoDB não conecta

```bash
# Verificar se MongoDB está rodando
brew services list | grep mongodb

# Iniciar MongoDB
brew services start mongodb-community

# Verificar logs
tail -f /usr/local/var/log/mongodb/mongo.log
```

### Erro de duplicidade

```bash
# Resetar índices
mongosh projluz
db.lotes.dropIndexes()
db.fotos.dropIndexes()

# Recriar
npm run api
```

### Fotos não processam

```bash
# Verificar fotos pendentes
mongosh projluz
db.fotos.countDocuments({ status: 'pendente' })

# Reprocessar manualmente
curl -X POST http://localhost:3000/api/lotes/lote001/processar
```

## 📚 Estrutura do Projeto

```
projluz/
├── src/
│   ├── api/
│   │   ├── server.js              # Express server
│   │   ├── routes/
│   │   │   ├── lotes.js           # Rotas de lotes
│   │   │   └── estatisticas.js   # Rotas de stats
│   │   └── controllers/
│   │       └── loteController.js # Business logic
│   ├── config/
│   │   └── database.js            # MongoDB connection
│   ├── models/
│   │   ├── Lote.js                # Schema de lote
│   │   └── Foto.js                # Schema de foto
│   ├── controllers/
│   │   └── batchProcessor.js     # Processamento
│   ├── services/
│   │   ├── awsService.js         # AWS Rekognition
│   │   ├── csvService.js         # CSV parser
│   │   ├── emailService.js       # Resend
│   │   └── logger.js             # Winston
│   ├── scripts/
│   │   └── importLotes.js        # Importação
│   └── index.js                   # Cron scheduler
├── credentials/
│   └── projluz-*.json            # Google credentials
├── results/                       # CSVs locais (backup)
├── logs/                          # Winston logs
├── .env                           # Variáveis de ambiente
├── package.json
└── README.md
```

## 🔐 Segurança

- Credenciais no `.env` (nunca commitar)
- Service Account para Google Drive (read-only)
- API sem autenticação (adicionar JWT/OAuth se necessário)
- MongoDB sem autenticação (habilitar em produção)

## 🚀 Deploy (Produção)

### MongoDB Atlas

```bash
# Atualizar .env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/projluz
```

### PM2 (Process Manager)

```bash
# Instalar PM2
npm install -g pm2

# Iniciar API
pm2 start src/api/server.js --name projluz-api

# Iniciar cron
pm2 start src/index.js --name projluz-cron

# Logs
pm2 logs projluz-api
```

### Nginx (Reverse Proxy)

```nginx
server {
  listen 80;
  server_name api.projluz.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

## 📈 Performance

- **Batch Insert**: 100 fotos por vez no MongoDB
- **Processamento Paralelo**: 10 fotos simultâneas (configurável)
- **Índices**: Otimizados para queries frequentes
- **Hash Cache**: Previne I/O desnecessário

## 🎯 Roadmap

- [ ] Autenticação JWT na API
- [ ] WebSocket para status em tempo real
- [ ] Dashboard web (React)
- [ ] Suporte a múltiplos tipos de OCR
- [ ] Machine Learning para validação
- [ ] API de webhooks
- [ ] Rate limiting AWS (evitar throttling)
- [ ] Backup automático MongoDB

## 📝 Changelog

### v2.0.0 (2024)
- ✅ MongoDB integration
- ✅ REST API com 8 endpoints
- ✅ Hash-based duplicate prevention
- ✅ Cost tracking
- ✅ Retry logic
- ✅ Real-time status

### v1.0.0 (2024)
- ✅ AWS Rekognition OCR
- ✅ Google Drive integration
- ✅ Resend email notifications
- ✅ CSV processing
- ✅ Cron scheduling

## 📞 Suporte

Para dúvidas ou problemas:
- Email: hednei_marangoni@yahoo.com.br
- GitHub Issues: [repo-url]/issues

## 📄 Licença

MIT License - veja LICENSE.md para detalhes
