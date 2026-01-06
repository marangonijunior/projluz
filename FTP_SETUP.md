# 📂 Configuração FTP - ProjLuz v2.0

## 🎯 Como Alternar entre Google Drive e FTP

O sistema ProjLuz v2.0 suporta **dois tipos de storage**:
- **Google Drive** (padrão)
- **FTP Server** (alternativo)

Para alternar entre os dois, basta mudar a variável **`STORAGE_TYPE`** no arquivo `.env`:

```bash
# Usar Google Drive
STORAGE_TYPE=drive

# OU usar FTP
STORAGE_TYPE=ftp
```

---

## 🔧 Configuração do Servidor FTP

### Variáveis de Ambiente Necessárias

Adicione estas variáveis no arquivo `.env`:

```bash
# FTP Configuration
FTP_HOST=ftp.seuservidor.com       # Endereço do servidor FTP
FTP_USER=usuario_ftp                # Usuário FTP
FTP_PASSWORD=senha_ftp              # Senha FTP
FTP_PORT=21                         # Porta (21 para FTP, 990 para FTPS)
FTP_SECURE=false                    # true para FTPS (FTP seguro)
FTP_BASE_FOLDER=/projluz            # Pasta raiz no servidor
FTP_VERBOSE=false                   # true para logs detalhados
```

---

## 📁 Estrutura de Pastas no Servidor FTP

O sistema **espera a seguinte estrutura de pastas**:

```
/projluz/                           ← FTP_BASE_FOLDER
├── lote_001.xlsx                   ← Arquivo CSV/XLSX com dados
├── lote_001/                       ← Pasta do lote
│   └── fotos/                      ← Subpasta com imagens
│       ├── IMG001.jpg
│       ├── IMG002.jpg
│       └── IMG003.jpg
├── lote_002.xlsx
├── lote_002/
│   └── fotos/
│       ├── IMG004.jpg
│       └── IMG005.jpg
└── lote_003.xlsx
    └── lote_003/
        └── fotos/
            └── IMG006.jpg
```

### ✅ Estruturas Alternativas Suportadas

O sistema busca imagens em **múltiplos caminhos**:

1. `/projluz/lote_001/fotos/IMG001.jpg` (padrão)
2. `/projluz/lote_001/IMG001.jpg` (direto na pasta)
3. `/projluz/lote_001/images/IMG001.jpg` (pasta 'images')
4. `/projluz/lote_001/photos/IMG001.jpg` (pasta 'photos')

---

## 📋 Formato do Arquivo CSV/XLSX

O arquivo deve conter as colunas (aceita múltiplos nomes):

| Coluna (variações aceitas) | Obrigatório | Descrição | Exemplo |
|----------------------------|-------------|-----------|---------|
| `cid` OU `id_prisma` OU `idPrisma` | ✅ Sim | ID único da foto | "24326" |
| `link_foto` OU `link_foto_plaqueta` OU `linkFotoPlaqueta` | ✅ Sim | Link da foto (URL ou caminho) | "45_ROCHA_MIRANDA/IMG.jpg" |

**Nome da sheet:** Sistema usa sempre a **primeira sheet**, independente do nome.

**Exemplo de CSV (opção 1):**
```csv
cid,link_foto
24326,https://prisma-ftp.perfilrk.com.br/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg
24327,45_ROCHA_MIRANDA/JPEG_20250822134654265.jpg
24328,46_MADUREIRA/JPEG_20250822140512789.jpg
```

**Exemplo de CSV (opção 2):**
```csv
id_prisma,link_foto_plaqueta
24326,https://prisma-ftp.perfilrk.com.br/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg
24327,45_ROCHA_MIRANDA/JPEG_20250822134654265.jpg
24328,46_MADUREIRA/JPEG_20250822140512789.jpg
```

**Exemplo de XLSX:**
| cid | link_foto |
|-----|-----------|
| 24326 | https://prisma-ftp.perfilrk.com.br/45_ROCHA_MIRANDA/JPEG_20250822134654264.jpg |
| 24327 | 45_ROCHA_MIRANDA/JPEG_20250822134654265.jpg |
| 24328 | 46_MADUREIRA/JPEG_20250822140512789.jpg |

---

## 🔐 Proteções Mantidas (Duplicação)

O sistema **mantém todas as proteções** independente do storage usado:

### 1️⃣ **Proteção de Arquivo (Hash de Lote)**
- Calcula hash SHA256 do arquivo CSV/XLSX completo
- Se o hash já existe no banco, **não importa** novamente
- Detecta arquivos modificados após primeira importação

### 2️⃣ **Proteção de Foto (Hash de Foto)**
- Calcula hash único: `SHA256(id_prisma:link_foto)`
- Se a foto já existe em outro lote, **ignora** (não duplica)
- Economiza processamento AWS Rekognition

**Resultado:** Nenhuma duplicação de lotes ou fotos, mesmo usando FTP!

---

## 🚀 Como Usar FTP

### Passo 1: Configurar Servidor FTP

Configure seu servidor FTP com um usuário específico:

```bash
# Exemplo: FileZilla Server, vsftpd, ProFTPD, etc.
Usuário: projluz_user
Senha: senha_segura_123
Pasta Home: /home/projluz_user/
```

### Passo 2: Fazer Upload dos Arquivos

Usando um cliente FTP (FileZilla, WinSCP, Cyberduck):

1. Conectar ao servidor FTP
2. Criar pasta `/projluz/` (ou outra definida em `FTP_BASE_FOLDER`)
3. Upload dos arquivos `.xlsx` ou `.csv`
4. Criar subpastas com fotos: `/projluz/lote_001/fotos/`
5. Upload das imagens JPG

### Passo 3: Configurar `.env`

```bash
# Alterar storage para FTP
STORAGE_TYPE=ftp

# Configurar credenciais
FTP_HOST=seu-servidor.com
FTP_USER=projluz_user
FTP_PASSWORD=senha_segura_123
FTP_BASE_FOLDER=/projluz
```

### Passo 4: Testar Conexão

```bash
# Verificar se FTP está acessível
node src/scripts/testFtpConnection.js
```

### Passo 5: Importar Lotes

```bash
# Importar todos os lotes do FTP
node src/scripts/importLotes.js
```

---

## 🔍 Verificação de Configuração

### Testar Conexão FTP

Crie um script de teste: `src/scripts/testFtpConnection.js`

```javascript
require('dotenv').config();
const { verificarStorage } = require('../services/storageService');

(async () => {
  try {
    console.log('🔍 Testando conexão FTP...\n');
    await verificarStorage();
    console.log('\n✅ Conexão FTP OK!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro na conexão FTP:', error.message);
    process.exit(1);
  }
})();
```

Executar:
```bash
node src/scripts/testFtpConnection.js
```

---

## 📊 Comparação: Drive vs FTP

| Característica | Google Drive | FTP |
|----------------|--------------|-----|
| **Setup** | Service Account + JSON | User/Pass simples |
| **Velocidade** | ~500ms/imagem | ~100-200ms/imagem ⚡ |
| **Dependências** | googleapis (pesado) | basic-ftp (leve) |
| **Quota** | 750GB/dia | Ilimitado (seu servidor) |
| **Segurança** | OAuth2 + SSL | FTPS recomendado |
| **Estrutura** | Folder IDs complexos | Caminhos simples |
| **Custo** | Grátis (Google) | Custo do servidor |

---

## 🛡️ Segurança Recomendada

### ⚠️ FTP Não Seguro
```bash
FTP_PORT=21
FTP_SECURE=false
```
- ❌ Senha trafega em texto plano
- ❌ Arquivos sem criptografia
- ⚠️ Usar apenas em redes privadas/internas

### ✅ FTPS (FTP Seguro)
```bash
FTP_PORT=990
FTP_SECURE=true
```
- ✅ Senha criptografada (SSL/TLS)
- ✅ Arquivos criptografados
- ✅ Recomendado para produção

### 🔐 Alternativa: SFTP
Para usar SFTP (SSH File Transfer Protocol):
- Instalar: `npm install ssh2-sftp-client`
- Adaptar `ftpService.js` para usar SFTP
- Mais seguro que FTP/FTPS

---

## 🐛 Troubleshooting

### Erro: "Cannot connect to FTP"

**Causas possíveis:**
1. Servidor FTP offline
2. Firewall bloqueando porta
3. Credenciais incorretas

**Solução:**
```bash
# Testar conexão manual
telnet seu-servidor.com 21

# Verificar logs
FTP_VERBOSE=true
```

### Erro: "File not found"

**Causas possíveis:**
1. Estrutura de pastas incorreta
2. Nomes de arquivo com erro
3. Permissões de leitura

**Solução:**
- Verificar estrutura: `/base_folder/lote_XXX/fotos/`
- Verificar permissões no servidor FTP
- Conferir logs com `FTP_VERBOSE=true`

### Erro: "Hash calculation failed"

**Causa:** Arquivo muito grande ou conexão lenta

**Solução:**
- Aumentar timeout de conexão
- Verificar tamanho dos arquivos CSV/XLSX
- Testar com arquivo menor primeiro

---

## 📦 Dependências Necessárias

```bash
# Instalar biblioteca FTP
npm install basic-ftp

# Para SFTP (opcional)
npm install ssh2-sftp-client
```

---

## ✅ Checklist de Implementação

- [x] **ftpService.js** criado com todas as funções
- [x] **storageService.js** criado (abstração Drive/FTP)
- [x] **importLotes.js** adaptado para usar storageService
- [x] **Variáveis .env** adicionadas (STORAGE_TYPE, FTP_*)
- [x] **Proteção de duplicatas** mantida (hash de arquivo + foto)
- [x] **Documentação completa** (este arquivo)
- [ ] **Instalar basic-ftp**: `npm install basic-ftp`
- [ ] **Testar conexão FTP** com seus dados
- [ ] **Fazer upload de lote teste** no FTP
- [ ] **Importar lote teste** e verificar fotos

---

## 🎯 Próximos Passos

1. **Instalar dependência FTP:**
   ```bash
   npm install basic-ftp
   ```

2. **Configurar servidor FTP** com seus dados reais

3. **Atualizar `.env`** com credenciais FTP

4. **Fazer upload** de 1 lote teste no FTP

5. **Testar importação:**
   ```bash
   STORAGE_TYPE=ftp node src/scripts/importLotes.js
   ```

6. **Verificar logs** e ajustar estrutura se necessário

7. **Deploy para produção** após testes OK

---

## 📝 Exemplo Completo

### Arquivo `.env`:
```bash
STORAGE_TYPE=ftp
FTP_HOST=ftp.meuservidor.com.br
FTP_USER=projluz
FTP_PASSWORD=Senh@Segur@123
FTP_PORT=21
FTP_SECURE=false
FTP_BASE_FOLDER=/home/projluz/lotes
FTP_VERBOSE=false
```

### Estrutura no Servidor:
```
/home/projluz/lotes/
├── lote_001.xlsx (100 linhas)
├── lote_001/fotos/ (100 imagens JPG)
├── lote_002.xlsx (5000 linhas)
└── lote_002/fotos/ (5000 imagens JPG)
```

### Comando de Importação:
```bash
node src/scripts/importLotes.js
```

### Resultado Esperado:
```
✅ lote_001.xlsx: 100 fotos importadas
✅ lote_002.xlsx: 5000 fotos importadas
```

---

**Sistema implementado por:** ProjLuz v2.0  
**Data:** 23 de Dezembro de 2025  
**Suporte a:** Google Drive + FTP Server  
**Proteções:** Hash de arquivo + Hash de foto (ambos sistemas)
