# Sistema de Importação Híbrido - Versão Final

## 📋 Resumo das Alterações Finais

### ✅ Implementações Concluídas

1. **Sistema não trava quando imagem não é encontrada**
   - Continua processando as demais imagens
   - Registra cada imagem não encontrada
   - Coleta informações completas: CID, link original, link normalizado

2. **Relatório de imagens não encontradas no email**
   - Seção destacada no email com todas as imagens não encontradas
   - Mostra até 50 imagens na lista
   - Indica total de imagens não encontradas
   - Inclui link original completo e caminho normalizado

3. **Importação apenas de imagens encontradas**
   - Apenas fotos encontradas no FTP são salvas no MongoDB
   - Sistema mantém integridade dos dados
   - Hash e validação de duplicatas funcionam normalmente

4. **Filtro de lotes >= 100**
   - Sistema busca apenas lotes a partir do lote_100
   - Ignora lotes menores automaticamente

5. **Múltiplos formatos de nomenclatura**
   - Aceita: `cid`, `id_prisma`, `idPrisma`
   - Aceita: `link_foto`, `link_foto_plaqueta`, `linkFotoPlaqueta`
   - Normaliza URLs automaticamente

## 🔧 Configuração Atual

### FTP
```env
FTP_HOST=177.170.129.30
FTP_USER=exati.ftp
FTP_PASSWORD=@Pr1sma2025!
FTP_PORT=2121
FTP_SECURE=false
FTP_BASE_FOLDER=/
FTP_VERBOSE=true
```

### Google Drive
- Planilhas devem estar na pasta configurada em `FOLDER_ID`
- Formatos aceitos: CSV, XLSX
- Nomenclatura: `lote_XXX.*` (onde XXX >= 100)

## 📊 Fluxo de Processamento

### 1. Busca no Drive
```javascript
// Lista apenas lotes >= 100
const arquivos = await hybridStorage.listarPlanilhasDrive(folderId);
```

### 2. Download e Parse
```javascript
// Baixa planilha do Drive
const buffer = await hybridStorage.baixarPlanilhaDrive(fileId);
// Parse CSV/XLSX
const dados = parseArquivo(buffer, fileName);
```

### 3. Verificação de Duplicatas (Planilha)
```javascript
// Hash do arquivo da planilha
const hashArquivo = await hybridStorage.calcularHashPlanilha(fileId);
// Verifica se já foi importado
const loteExistente = await Lote.findOne({ hashArquivo });
```

### 4. Processamento de Fotos
```javascript
for (const linha of dados) {
  // Extrai dados com suporte a múltiplos nomes
  const idPrisma = linha.cid || linha.id_prisma || linha.idPrisma;
  const linkFoto = linha.link_foto || linha.link_foto_plaqueta || linha.linkFotoPlaqueta;
  
  // Normaliza link (remove domínio)
  const linkNormalizado = hybridStorage.normalizarLinkFoto(linkFoto);
  
  // Verifica duplicata (foto)
  const hashFoto = calcularHash(`${idPrisma}:${linkNormalizado}`);
  const fotoExistente = await Foto.findOne({ hashFoto });
  
  if (!fotoExistente) {
    // Busca no FTP
    const caminhoFTP = await hybridStorage.buscarFotoFtp(linkFoto);
    
    if (caminhoFTP) {
      // ✅ Encontrada - importa
      await Foto.create({ idPrisma, linkFoto: linkNormalizado, ftpPath: caminhoFTP, ... });
      fotosImportadas++;
    } else {
      // ❌ Não encontrada - registra mas NÃO importa
      fotosNaoEncontradas.push({
        cid: idPrisma,
        linkOriginal: linkFoto,
        linkNormalizado: linkNormalizado
      });
    }
  }
}
```

### 5. Email de Resumo

Inclui:
- ✅ Total de fotos processadas
- ✅ Fotos importadas com sucesso
- ✅ Fotos duplicadas ignoradas
- ⚠️ **Fotos não encontradas no FTP** (lista completa)
- 🔗 Links para API (exportar, status, detalhes)

## 📁 Estrutura de Arquivos

### Arquivos Principais
```
src/
├── scripts/
│   └── importLotes.js          ← Script principal de importação
├── services/
│   ├── hybridStorageService.js ← Gerencia Drive + FTP
│   ├── driveService.js         ← Google Drive API
│   ├── ftpService.js           ← FTP Client
│   └── emailService.js         ← Envia emails com relatório
└── models/
    ├── Lote.js                 ← Schema do Lote
    └── Foto.js                 ← Schema da Foto
```

## 🚀 Como Usar

### Preparação
1. Suba as planilhas no Google Drive na pasta configurada
2. Certifique-se de que o FTP está acessível
3. Configure as variáveis de ambiente (.env)

### Execução Manual
```bash
node src/scripts/importLotes.js
```

### Execução Automática (CRON)
```javascript
// Já configurado no Heroku Scheduler
// Roda a cada 4 horas
0 */4 * * * node src/scripts/importLotes.js
```

## 📧 Formato do Email

### Seção de Estatísticas
```
Total de fotos analisadas: 1500
✅ Sucesso: 1200 (80%)
❌ Falhas: 50 (3.3%)
⏭️ Duplicadas: 200 (13.3%)
⚠️ Não encontradas: 50 (3.3%)
```

### Seção de Imagens Não Encontradas
```
⚠️ Imagens Não Encontradas no FTP (50)

As imagens abaixo estão listadas no Excel mas não foram 
encontradas no servidor FTP. Elas NÃO foram importadas.

1. CID: 278
   Link: https://prisma-ftp.perfilrk.com.br/46_HONORIO_GURGEL/JPEG_20250822171650866.jpg
   Normalizado: 46_HONORIO_GURGEL/JPEG_20250822171650866.jpg

2. CID: 345
   Link: 16_IRAJA/JPEG_20250905212316205.jpg
   Normalizado: 16_IRAJA/JPEG_20250905212316205.jpg

... (lista completa)
```

## 🔍 Verificação de Status

### Via API
```bash
# Status do lote
GET /api/lotes/lote_100/status

# Fotos do lote
GET /api/lotes/lote_100/fotos

# Exportar CSV
GET /api/lotes/lote_100/export
```

### Via Logs
```bash
# Heroku
heroku logs --tail --app seu-app

# Local
tail -f logs/combined.log
```

## ⚠️ Avisos Importantes

1. **Planilhas < lote_100 são ignoradas**
   - Sistema só processa lotes >= 100
   - Para alterar, edite `hybridStorageService.js` linha 32

2. **Imagens não encontradas NÃO travam o processo**
   - Sistema continua processando
   - Lista completa enviada no email
   - Não são salvas no banco de dados

3. **Duplicatas são detectadas em dois níveis**
   - Planilha: Hash do arquivo inteiro (evita reimportar lote)
   - Foto: Hash de CID + caminho normalizado (evita duplicar foto)

4. **Formatos de arquivo aceitos**
   - Planilhas: `.csv`, `.xlsx`
   - Fotos: `.jpg`, `.JPG`, `.jpeg`, `.JPEG`

5. **Normalização de URLs**
   - `https://domain.com/pasta/arquivo.jpg` → `pasta/arquivo.jpg`
   - `/pasta/arquivo.jpg` → `pasta/arquivo.jpg`
   - `pasta/arquivo.jpg` → `pasta/arquivo.jpg`

## 🧪 Testes Realizados

- ✅ Conexão FTP (177.170.129.30:2121)
- ✅ Listagem de 1220+ pastas FTP
- ✅ Busca de arquivos específicos
- ✅ Normalização de URLs (7 formatos testados)
- ✅ Múltiplos nomes de colunas (4 combinações testadas)
- ✅ Taxa de sucesso: ~67% (4/6 arquivos encontrados)
- ✅ Sistema não trava com arquivos não encontrados

## 📝 Próximos Passos

Após subir planilhas no Google Drive:

1. **Teste local primeiro**
   ```bash
   node src/scripts/importLotes.js
   ```

2. **Verifique o email**
   - Confira estatísticas
   - Analise lista de imagens não encontradas
   - Valide links da API

3. **Deploy no Heroku**
   ```bash
   git add .
   git commit -m "Sistema híbrido finalizado"
   git push heroku main
   ```

4. **Configure CRON no Heroku Scheduler**
   - Comando: `node src/scripts/importLotes.js`
   - Frequência: A cada 4 horas

## 🐛 Troubleshooting

### Imagens não encontradas

**Sintoma:** Muitas imagens na seção "Não Encontradas"

**Causas possíveis:**
1. Links no Excel desatualizados
2. Arquivos com nomes diferentes no FTP
3. Arquivos em pastas diferentes

**Solução:**
1. Verifique os primeiros links do relatório
2. Compare com estrutura real do FTP
3. Atualize Excel ou ajuste mapeamento

### FTP Connection Timeout

**Sintoma:** Erro ao conectar FTP

**Solução:**
```bash
# Teste conectividade
telnet 177.170.129.30 2121

# Verifique credenciais
cat .env | grep FTP_
```

### Lotes não aparecem

**Sintoma:** "0 arquivos encontrados"

**Causas:**
1. FOLDER_ID incorreto
2. Lotes < 100 (são filtrados)
3. Nomenclatura diferente de `lote_XXX`

**Solução:**
```bash
# Verifique FOLDER_ID
echo $FOLDER_ID

# Liste arquivos no Drive
node -e "require('./src/services/driveService').listCsvFiles(process.env.FOLDER_ID).then(console.log)"
```

## 📞 Suporte

- Logs: `logs/combined.log` e `logs/error.log`
- Documentação: `MODELO_HIBRIDO.md`, `NORMALIZACAO_URLS.md`
- Exemplo de email: `EXEMPLO-EMAIL.md`
