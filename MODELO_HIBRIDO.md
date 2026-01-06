# 🔄 Modelo Híbrido - ProjLuz v2.0

## 📋 Resumo

O sistema agora opera em **modo híbrido**:

| Componente | Local | Formato |
|------------|-------|---------|
| **Planilhas** | Google Drive | CSV/XLSX (lotes >= 50) |
| **Fotos** | FTP Server | JPG (via caminho completo) |

---

## 📂 Estrutura de Armazenamento

### 1️⃣ **Planilhas (Google Drive)**

As planilhas CSV/XLSX ficam no Google Drive:

```
Google Drive (FOLDER_ID=1ROEdQiD9QlwRWRP1F--KSs2iKk2bf0Po)
├── lote_050.xlsx
├── lote_051.xlsx
├── lote_052.xlsx
└── lote_053.xlsx
```

**Filtro:** Apenas lotes com número >= 50 são importados (ignora lotes 001-049).

**Colunas obrigatórias** (aceita múltiplos nomes):
- **ID da foto**: `cid` OU `id_prisma` OU `idPrisma`
- **Link da foto**: `link_foto` OU `link_foto_plaqueta` OU `linkFotoPlaqueta`

**Nome da sheet**: Sistema usa sempre a **primeira sheet**, independente do nome.

**Formatos aceitos para link da foto:**
1. **URL completa**: `https://prisma-ftp.perfilrk.com.br/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg`
2. **Caminho relativo**: `45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg`

O sistema automaticamente remove o domínio e normaliza o caminho.

**Exemplos de planilhas válidas:**

| cid | link_foto |
|-----|-----------|
| 24326 | https://prisma-ftp.perfilrk.com.br/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg |
| 24327 | 45_ROCHA_MIRANDA/JPEG_20250822134654265.jpg |

OU

| id_prisma | link_foto_plaqueta |
|-----------|-------------------|
| 24326 | https://prisma-ftp.perfilrk.com.br/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg |
| 24327 | 45_ROCHA_MIRANDA/JPEG_20250822134654265.jpg |

---

### 2️⃣ **Fotos (FTP Server)**

As fotos JPG ficam no servidor FTP organizadas por pastas:

```
FTP Server (/projluz/)
├── 45_ROCHA_MIRANDA/
│   ├── JPEG_20250822134654264.jpg
│   ├── JPEG_20250822134654265.jpg
│   └── JPEG_20250822134654266.jpg
├── 46_MADUREIRA/
│   ├── JPEG_20250822140512789.jpg
│   └── JPEG_20250822140512790.jpg
└── 47_CAMPO_GRANDE/
    └── JPEG_20250822145623123.jpg
```

**Formato dos caminhos:**
- Coluna `link_foto_plaqueta` aceita:
  - **URL completa**: `https://prisma-ftp.perfilrk.com.br/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg`
  - **Caminho relativo**: `45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg`
- Sistema normaliza automaticamente (remove domínio)
- Caminho final no FTP: `/projluz/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg`

---

## 🔧 Configuração (.env)

```bash
# Google Drive - Planilhas CSV/XLSX (lotes >= 50)
FOLDER_ID=1ROEdQiD9QlwRWRP1F--KSs2iKk2bf0Po
GOOGLE_CREDENTIALS_PATH=./credentials/projluz-b485ebf65072.json

# FTP Server - Fotos JPG
FTP_HOST=ftp.seuservidor.com
FTP_USER=usuario_ftp
FTP_PASSWORD=senha_ftp
FTP_PORT=21
FTP_SECURE=false
FTP_BASE_FOLDER=/projluz
FTP_VERBOSE=false
```

---

## 🚀 Como Funciona

### Fluxo de Importação

```
1. Listar planilhas do Google Drive
   ↓
2. Filtrar apenas lotes >= 50
   ↓
3. Baixar planilha do Drive
   ↓
4. Calcular hash da planilha (detectar duplicatas)
   ↓
5. Parsear CSV/XLSX
   ↓
6. Para cada linha:
   ├─ Ler id_prisma e link_foto_plaqueta
   ├─ Buscar foto no FTP: /projluz/{link_foto_plaqueta}
   ├─ Verificar hash da foto (detectar duplicatas)
   ├─ Salvar registro no MongoDB
   └─ Continuar próxima foto
   ↓
7. Marcar lote como "pendente" para processamento AWS
```

### Arquivos Criados

**1. `src/services/hybridStorageService.js`** (184 linhas)
- `listarPlanilhasDrive()`: Lista planilhas do Drive (filtro >= 50)
- `baixarPlanilhaDrive()`: Baixa planilha como Buffer
- `calcularHashPlanilha()`: Hash SHA256 da planilha
- `buscarFotoFtp()`: Busca foto no FTP usando caminho completo
- `baixarFotoTemp()`: Baixa foto do FTP para processamento
- `verificarConexaoHibrida()`: Testa Drive e FTP
- `getConfigInfo()`: Retorna configuração do sistema

**2. `src/services/ftpService.js` (MODIFICADO)**
- Adicionado: `buscarImagemCaminhoCompleto()` para caminhos tipo `pasta/arquivo.jpg`

**3. `src/scripts/importLotes.js` (REESCRITO)**
- Usa `hybridStorageService` em vez de `storageService`
- Busca fotos no FTP usando `link_foto_plaqueta` completo
- Salva campo `ftpPath` no modelo Foto
- Filtra automaticamente lotes >= 50

---

## 🛡️ Proteções Mantidas

### 1️⃣ **Hash de Planilha (Anti-Reprocessamento)**
```javascript
// Calcula hash SHA256 da planilha inteira
const hashArquivo = await hybridStorage.calcularHashPlanilha(fileId);

// Verifica se já foi importada
const loteExistente = await Lote.findOne({ hashArquivo });
```

**Resultado:** Se a planilha já foi importada, não reprocessa.

---

### 2️⃣ **Hash de Foto (Anti-Duplicação)**
```javascript
// Hash único: id_prisma + link_foto
const hashFoto = calcularHash(`${idPrisma}:${linkFoto}`);

// Verifica se foto já existe
const fotoExistente = await Foto.findOne({ hashFoto });
```

**Resultado:** Se a foto já existe em outro lote, ignora.

---

## 📝 Modelo de Dados Atualizado

### Modelo Lote
```javascript
{
  nome: "lote_050",
  driveFileId: "1XYZ...",        // ID da planilha no Drive
  driveFileName: "lote_050.xlsx",
  hashArquivo: "a3f2...",         // Hash SHA256 da planilha
  storageType: "hybrid",          // Novo: indica modo híbrido
  totalFotos: 5000,
  fotosImportadas: 4850,
  status: "pendente"
}
```

### Modelo Foto
```javascript
{
  idPrisma: "24326",
  linkFoto: "45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg",  // Caminho relativo
  ftpPath: "/projluz/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg",  // Caminho absoluto FTP
  hashFoto: "b7c9...",            // Hash SHA256 (id:link)
  lote: ObjectId("..."),
  status: "pendente"
}
```

---

## ✅ Comandos de Teste

### 1. Verificar Conexão Híbrida

```bash
node -e "
const hybrid = require('./src/services/hybridStorageService');
const { connectDatabase } = require('./src/config/database');

(async () => {
  await connectDatabase();
  await hybrid.verificarConexaoHibrida();
  
  const config = hybrid.getConfigInfo();
  console.log(JSON.stringify(config, null, 2));
  
  process.exit(0);
})();
"
```

### 2. Listar Planilhas Filtradas

```bash
node -e "
const hybrid = require('./src/services/hybridStorageService');

(async () => {
  const arquivos = await hybrid.listarPlanilhasDrive(process.env.FOLDER_ID);
  
  console.log('Arquivos encontrados (>= lote_050):');
  arquivos.forEach(a => console.log('-', a.name));
  
  process.exit(0);
})();
"
```

### 3. Testar Busca de Foto no FTP

```bash
node -e "
const hybrid = require('./src/services/hybridStorageService');

(async () => {
  const caminho = '45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg';
  const ftpPath = await hybrid.buscarFotoFtp(caminho);
  
  if (ftpPath) {
    console.log('✅ Foto encontrada:', ftpPath);
  } else {
    console.log('❌ Foto não encontrada');
  }
  
  process.exit(0);
})();
"
```

### 4. Importar Todos os Lotes

```bash
node src/scripts/importLotes.js
```

---

## 🔍 Troubleshooting

### Erro: "FOLDER_ID não definido"

**Causa:** Variável de ambiente ausente.

**Solução:**
```bash
# Verificar se FOLDER_ID está no .env
grep FOLDER_ID .env

# Deve retornar:
# FOLDER_ID=1ROEdQiD9QlwRWRP1F--KSs2iKk2bf0Po
```

---

### Erro: "Cannot connect to FTP"

**Causa:** Credenciais FTP incorretas ou servidor offline.

**Solução:**
```bash
# Testar conexão FTP manualmente
telnet $FTP_HOST $FTP_PORT

# Verificar variáveis
echo "Host: $FTP_HOST"
echo "User: $FTP_USER"
echo "Port: $FTP_PORT"
```

---

### Erro: "Foto não encontrada no FTP"

**Causa:** Caminho na coluna `link_foto_plaqueta` não existe no FTP.

**Exemplos de caminhos esperados:**
```
Planilha: 45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg
FTP: /projluz/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg
      ↑        ↑
   BASE_FOLDER  link_foto_plaqueta
```

**Solução:**
```bash
# Verificar estrutura no FTP
FTP_VERBOSE=true node src/scripts/importLotes.js
```

---

### Nenhum lote importado (todos duplicados)

**Causa:** Planilhas já foram importadas anteriormente.

**Verificação:**
```bash
# Listar lotes no banco
mongo $MONGODB_URI --eval "db.lotes.find().pretty()"

# Verificar hashes
mongo $MONGODB_URI --eval "db.lotes.find({}, {nome: 1, hashArquivo: 1})"
```

**Solução (reprocessar):**
```bash
# Deletar lotes específicos
mongo $MONGODB_URI --eval "db.lotes.deleteMany({nome: /lote_05/})"

# Reimportar
node src/scripts/importLotes.js
```

---

## 📊 Comparação: Antes vs Agora

| Aspecto | Antes | Agora |
|---------|-------|-------|
| **Planilhas** | Google Drive | Google Drive |
| **Fotos** | Google Drive | FTP Server |
| **Filtro de lotes** | Nenhum | >= 50 |
| **Caminho das fotos** | Busca por nome | Caminho completo |
| **Estrutura FTP** | `/lote_XXX/fotos/` | `/pasta/arquivo.jpg` |
| **Duplicação** | Hash protegido | Hash protegido |
| **Storage Type** | `drive` ou `ftp` | `hybrid` |

---

## 🎯 Próximos Passos

### 1. Configurar FTP Server
- [ ] Obter credenciais FTP (host, user, password)
- [ ] Atualizar `.env` com dados FTP
- [ ] Testar conexão: `verificarConexaoHibrida()`

### 2. Organizar Fotos no FTP
- [ ] Criar estrutura de pastas (ex: `45_ROCHA_MIRANDA/`)
- [ ] Upload das fotos JPG
- [ ] Verificar nomes de arquivos batem com planilha

### 3. Atualizar Planilhas no Drive
- [ ] Garantir coluna `link_foto_plaqueta` existe
- [ ] Caminhos devem ser relativos: `pasta/arquivo.jpg`
- [ ] Lotes devem ter numeração >= 50

### 4. Testar Importação
- [ ] Testar com 1 lote pequeno (100 fotos)
- [ ] Verificar logs: `FTP_VERBOSE=true`
- [ ] Confirmar fotos foram encontradas
- [ ] Validar registros no MongoDB

### 5. Importação em Produção
- [ ] Importar todos os lotes >= 50
- [ ] Monitorar duplicatas e erros
- [ ] Verificar custos AWS Rekognition
- [ ] Configurar CRON para importações automáticas

---

## 📞 Suporte

**Sistema implementado:** 29 de Dezembro de 2025  
**Modo:** Híbrido (Google Drive + FTP)  
**Proteções:** Hash de planilha + Hash de foto  
**Filtro:** Apenas lotes >= 50

---

## 🔐 Segurança

### Google Drive (Planilhas)
- ✅ Service Account com credenciais JSON
- ✅ OAuth2 + SSL automático
- ✅ Acesso limitado ao FOLDER_ID específico

### FTP Server (Fotos)
- ⚠️ **Recomendado:** FTPS (FTP_SECURE=true, FTP_PORT=990)
- ⚠️ **Evitar:** FTP simples em redes públicas
- ✅ Usar senha forte (mínimo 12 caracteres)
- ✅ Limitar acesso IP se possível

---

**Fim da Documentação**
