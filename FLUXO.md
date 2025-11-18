# 🔄 Fluxo Completo do Sistema ProjLuz v2.0

## 📊 Visão Geral

```
┌─────────────────┐
│  Google Drive   │
│   (CSVs)        │
└────────┬────────┘
         │
         │ 1. IMPORTAÇÃO
         ↓
┌─────────────────┐
│  Import Script  │
│  - Calcula hash │
│  - Verifica dup │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│    MongoDB      │
│  Lote + Fotos   │
└────────┬────────┘
         │
         │ 2. PROCESSAMENTO
         ↓
┌─────────────────┐
│ Batch Processor │
│  - Download img │
│  - AWS OCR      │
│  - Update DB    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   API REST      │
│  - Exportar CSV │
│  - Status       │
└────────┬────────┘
         │
         │ 3. NOTIFICAÇÃO
         ↓
┌─────────────────┐
│  Email (Resend) │
│  Link download  │
└─────────────────┘
```

## 1️⃣ FASE 1: Importação de Lotes

### Entrada
- CSVs na pasta do Google Drive
- Formato: `id_prisma, link_foto_plaqueta`

### Processo

```
START
  │
  ├─→ Listar CSVs da pasta Drive (FOLDER_ID)
  │   │
  │   └─→ Para cada arquivo CSV:
  │       │
  │       ├─→ Baixar conteúdo do Drive
  │       │
  │       ├─→ Calcular hash SHA256 do arquivo
  │       │   (hash binário completo)
  │       │
  │       ├─→ Verificar duplicidade no MongoDB
  │       │   │
  │       │   ├─→ JÁ EXISTE? → Pular (retornar "duplicado")
  │       │   │
  │       │   └─→ NÃO EXISTE? → Continuar
  │       │
  │       ├─→ Criar documento Lote:
  │       │   {
  │       │     nome: "lote001",
  │       │     hashArquivo: "a1b2c3...",
  │       │     status: "importando",
  │       │     totalFotos: 150,
  │       │     custoEstimadoAWS: 0.150
  │       │   }
  │       │
  │       ├─→ Parsear linhas do CSV
  │       │
  │       └─→ Importar fotos em lotes de 100:
  │           │
  │           └─→ Para cada linha:
  │               │
  │               ├─→ Extrair: id_prisma, link_foto_plaqueta
  │               │
  │               ├─→ Calcular hash: SHA256(id_prisma:link)
  │               │
  │               ├─→ Verificar duplicidade (hashFoto)
  │               │   │
  │               │   ├─→ JÁ EXISTE? → Pular (contador++)
  │               │   │
  │               │   └─→ NÃO EXISTE? → Criar Foto
  │               │
  │               └─→ Criar documento Foto:
  │                   {
  │                     loteId: ObjectId,
  │                     idPrisma: "ABC123",
  │                     linkFotoOriginal: "https://...",
  │                     hashFoto: "e5f6g7...",
  │                     status: "pendente",
  │                     tentativas: 0
  │                   }
  │
  └─→ Atualizar status do Lote: "pendente"
  │
END

RESULTADO:
✓ Lote criado no MongoDB
✓ X fotos importadas
✓ Y fotos duplicadas ignoradas
✓ Custo estimado: $X.XXX
```

### Comando

```bash
npm run import
```

### Output Esperado

```
Iniciando importação de lotes...
Encontrados 3 arquivos CSV

✓ lote001: 150 fotos (2 duplicadas)
✓ lote002: 200 fotos (0 duplicadas)
✗ lote003: duplicado (hash já existe)

Importação concluída: 2 sucesso, 1 falha
```

---

## 2️⃣ FASE 2: Processamento de Fotos

### Disparo

**Opção A: Via API**
```bash
curl -X POST http://localhost:3000/api/lotes/lote001/processar
```

**Opção B: Via Cron (automático)**
```bash
npm start  # Executa imediatamente + agendamento
```

### Processo

```
START: Processamento do Lote
  │
  ├─→ Buscar Lote no MongoDB (nome: "lote001")
  │
  ├─→ Verificar status:
  │   ├─→ "processando"? → Retornar erro (já em execução)
  │   ├─→ "concluido"? → Retornar erro (já processado)
  │   └─→ "pendente"? → Continuar
  │
  ├─→ Atualizar Lote:
  │   lote.status = "processando"
  │   lote.dataInicio = new Date()
  │
  ├─→ Buscar fotos pendentes (status: "pendente")
  │   LIMIT 10 (processamento paralelo)
  │
  └─→ Para cada FOTO:
      │
      ├─→ Verificar hash (prevenção duplicidade)
      │   │
      │   └─→ Hash já processado? → Pular
      │
      ├─→ Atualizar status:
      │   foto.status = "processando"
      │   foto.tentativas++
      │   foto.dataUltimaProcessamento = new Date()
      │
      ├─→ BAIXAR IMAGEM:
      │   │
      │   ├─→ Extrair file_id da URL
      │   ├─→ Download via Google Drive API
      │   ├─→ Salvar buffer em memória
      │   │
      │   └─→ ERRO? → Registrar falha
      │       │
      │       ├─→ foto.historicoErros.push(erro)
      │       ├─→ tentativas < 3? → Retry
      │       └─→ tentativas >= 3? → status = "falha"
      │
      ├─→ PROCESSAR OCR (AWS Rekognition):
      │   │
      │   ├─→ Enviar buffer para detectText()
      │   ├─→ Extrair linhas de texto
      │   ├─→ Filtrar números de 6 dígitos
      │   ├─→ Validar confidencialidade >= 95%
      │   │
      │   └─→ RESULTADO:
      │       {
      │         numero: "123456",
      │         confidencialidade: 98.5,
      │         textoCompleto: "ABC 123456 DEF"
      │       }
      │
      ├─→ ATUALIZAR MONGODB:
      │   │
      │   ├─→ SUCESSO:
      │   │   foto.status = "sucesso"
      │   │   foto.numeroEncontrado = "123456"
      │   │   foto.confidencialidade = 98.5
      │   │   foto.custoAWS = 0.001
      │   │   foto.tempoTotal = 1250 (ms)
      │   │   foto.dataProcessamentoSucesso = new Date()
      │   │
      │   └─→ FALHA:
      │       foto.status = "falha" (se tentativas >= 3)
      │       foto.ultimoErro = { mensagem, timestamp }
      │
      ├─→ ATUALIZAR ESTATÍSTICAS DO LOTE:
      │   lote.fotosSucesso++
      │   lote.custoRealAWS += 0.001
      │   lote.tempoTotalProcessamento += 1250
      │
      └─→ Próxima foto...
  │
  ├─→ Todas as fotos processadas?
  │
  ├─→ FINALIZAR LOTE:
  │   lote.status = "concluido"
  │   lote.dataConclusao = new Date()
  │   lote.tempoMedioPorFoto = tempoTotal / totalFotos
  │   lote.percentualSucesso = (sucesso / total) * 100
  │
  ├─→ ENVIAR EMAIL:
  │   │
  │   ├─→ Gerar resumo:
  │   │   "Lote processado: 145/150 sucesso (96.67%)"
  │   │   "Custo real: $0.145"
  │   │
  │   └─→ Link para download:
  │       http://localhost:3000/api/lotes/lote001/export
  │
END
```

### Fluxo de Retry (Tentativas)

```
Foto com erro
  │
  ├─→ Tentativa 1: FALHA
  │   │
  │   ├─→ historicoErros[0] = "Network timeout"
  │   └─→ status = "pendente" (reavaliar)
  │
  ├─→ Tentativa 2: FALHA
  │   │
  │   ├─→ historicoErros[1] = "Invalid image format"
  │   └─→ status = "pendente" (última chance)
  │
  └─→ Tentativa 3: FALHA
      │
      ├─→ historicoErros[2] = "AWS throttling"
      └─→ status = "falha" (definitivo)
          tentativas = 3 (máximo atingido)
```

---

## 3️⃣ FASE 3: Consulta e Exportação

### Via API REST

```
┌─────────────────────────────────────────────┐
│         ENDPOINTS DISPONÍVEIS               │
└─────────────────────────────────────────────┘

1. LISTAR LOTES
   GET /api/lotes?status=concluido&page=1
   │
   └─→ Retorna: Array de lotes + paginação

2. DETALHES DO LOTE
   GET /api/lotes/lote001
   │
   └─→ Retorna: Objeto lote completo

3. EXPORTAR CSV
   GET /api/lotes/lote001/export
   │
   ├─→ Buscar Lote no MongoDB
   ├─→ Buscar todas as Fotos do lote
   ├─→ Gerar CSV:
   │   id_prisma, link_foto_plaqueta, numero_encontrado, confidencialidade, status
   │   ABC123, https://..., 123456, 98.5, sucesso
   │   DEF456, https://..., , , falha
   │
   └─→ Download: resultado_lote001.csv

4. FOTOS DO LOTE
   GET /api/lotes/lote001/fotos?status=falha
   │
   └─→ Retorna: Array de fotos + paginação

5. STATUS EM TEMPO REAL
   GET /api/lotes/lote001/status
   │
   └─→ Retorna: {
       nome: "lote001",
       status: "processando",
       fotosProcessadas: 75/150,
       percentualConcluido: 50%,
       tempoDecorrido: 320s,
       custoReal: $0.075
     }

6. ESTATÍSTICAS GERAIS
   GET /api/estatisticas
   │
   └─→ Retorna: {
       lotes: { total: 10, concluidos: 8 },
       fotos: { total: 1500, sucesso: 1450 },
       custos: { real: $1.450, economia: $0.050 }
     }
```

---

## 🔁 Fluxo Completo (Ponta a Ponta)

```
DIA 1: Importação
═════════════════

09:00 → Executar: npm run import
        │
        ├─→ Drive: Encontrados 5 CSVs
        ├─→ CSV 1: lote001.csv (150 fotos) → Importado
        ├─→ CSV 2: lote002.csv (200 fotos) → Importado
        ├─→ CSV 3: lote001.csv (150 fotos) → DUPLICADO (hash igual)
        ├─→ CSV 4: lote003.csv (100 fotos) → Importado
        └─→ CSV 5: lote004.csv (300 fotos) → Importado

09:05 → MongoDB:
        ├─→ 4 Lotes criados (1 duplicado ignorado)
        ├─→ 750 Fotos pendentes
        └─→ Custo estimado: $0.750

DIA 2: Processamento Manual
═══════════════════════════

10:00 → API Request: POST /api/lotes/lote001/processar
        │
        └─→ Processamento iniciado (background)

10:01 → AWS Rekognition:
        ├─→ Foto 1: Sucesso (123456, 98.5%)
        ├─→ Foto 2: Sucesso (789012, 97.2%)
        ├─→ Foto 3: Falha (tentativa 1/3)
        └─→ ...

10:15 → Lote concluído:
        ├─→ 145/150 sucesso (96.67%)
        ├─→ 5 falhas (3 tentativas cada)
        └─→ Custo real: $0.145

10:16 → Email enviado:
        "Lote001 processado!"
        [Baixar Resultado CSV]

DIA 3: Consulta e Análise
═════════════════════════

14:00 → Dashboard query:
        GET /api/estatisticas
        │
        └─→ 4 lotes, 750 fotos, 720 sucesso (96%)

14:05 → Download resultados:
        GET /api/lotes/lote001/export
        │
        └─→ resultado_lote001.csv baixado

14:10 → Investigar falhas:
        GET /api/lotes/lote001/fotos?status=falha
        │
        └─→ 5 fotos com erro detalhado

DIA 4: Processamento Automático (Cron)
═══════════════════════════════════════

00:00 → Cron trigger (0 0 * * *)
        │
        ├─→ Buscar lotes pendentes
        │   (lote002, lote003, lote004)
        │
        └─→ Processar sequencialmente:
            ├─→ lote002: 200 fotos → 100% sucesso
            ├─→ lote003: 100 fotos → 98% sucesso
            └─→ lote004: 300 fotos → 95% sucesso

06:30 → Todos os lotes processados
        │
        └─→ 3 emails enviados com links
```

---

## 📊 Prevenção de Duplicidades

### Cenário 1: Mesmo CSV importado 2x

```
Tentativa 1:
  lote001.csv → Hash: a1b2c3d4...
  └─→ MongoDB: Lote criado ✓

Tentativa 2:
  lote001.csv → Hash: a1b2c3d4... (IGUAL!)
  └─→ MongoDB: findOne({ hashArquivo: "a1b2c3d4" })
      └─→ EXISTE! → Retornar "duplicado"
          └─→ Economia: 150 fotos × $0.001 = $0.150 💰
```

### Cenário 2: Mesma foto em lotes diferentes

```
Lote A:
  Foto: ABC123, https://drive.com/file1
  Hash: SHA256("ABC123:https://drive.com/file1") = xyz789...
  └─→ MongoDB: Foto criada ✓

Lote B:
  Foto: ABC123, https://drive.com/file1 (MESMA!)
  Hash: xyz789... (IGUAL!)
  └─→ MongoDB: findOne({ hashFoto: "xyz789" })
      └─→ EXISTE! → Pular esta foto
          └─→ Economia: $0.001 💰
```

---

## 🎯 Casos de Uso

### 1. Reprocessar fotos com falha

```bash
# 1. Identificar fotos com falha
mongosh projluz
db.fotos.find({ status: "falha", tentativas: { $lt: 3 } })

# 2. Resetar status para pendente
db.fotos.updateMany(
  { status: "falha", tentativas: { $lt: 3 } },
  { $set: { status: "pendente" } }
)

# 3. Reprocessar via API
curl -X POST http://localhost:3000/api/lotes/lote001/processar
```

### 2. Monitorar processamento em tempo real

```bash
# Terminal 1: Iniciar processamento
curl -X POST http://localhost:3000/api/lotes/lote001/processar

# Terminal 2: Pooling de status (a cada 5s)
watch -n 5 'curl -s http://localhost:3000/api/lotes/lote001/status | jq'
```

### 3. Exportar apenas fotos com sucesso

```javascript
// Modificar controller para adicionar filtro
GET /api/lotes/lote001/export?status=sucesso

// Query MongoDB:
const fotos = await Foto.find({ 
  loteId: lote._id,
  status: 'sucesso'  // ← Filtro
});
```

---

## 💡 Otimizações Implementadas

1. **Batch Insert** - 100 fotos por vez (vs. 1 por vez)
2. **Hash Indexado** - Busca O(1) vs O(n)
3. **Processamento Paralelo** - 10 fotos simultâneas
4. **Lazy Loading** - Pagination em queries grandes
5. **Connection Pooling** - Reuso de conexões MongoDB
6. **Stream Processing** - Download de imagens em stream

---

## 🔧 Troubleshooting

### Lote travado em "processando"

```javascript
// Resetar status manualmente
db.lotes.updateOne(
  { nome: "lote001" },
  { $set: { status: "pendente" } }
)
```

### Fotos não aparecem no export

```javascript
// Verificar fotos no MongoDB
db.fotos.find({ loteNome: "lote001" }).count()

// Verificar status
db.fotos.aggregate([
  { $match: { loteNome: "lote001" } },
  { $group: { _id: "$status", count: { $sum: 1 } } }
])
```

---

Este é o fluxo completo do sistema! 🚀
