# 📋 Regras de Validação de Números

## 🎯 Objetivo

Garantir que apenas números de **exatamente 6 dígitos** sejam aceitos, com tratamento especial para casos ambíguos.

---

## ✅ Regras Implementadas

### 1. Números com MENOS de 6 dígitos → IGNORAR

```
Exemplo:
  AWS detectou: "123", "45", "7890"
  Ação: IGNORAR (não processar)
  Status: FALHA
  Motivo: "Apenas números com tamanho diferente de 6: 123 (3 dígitos), 45 (2 dígitos), 7890 (4 dígitos)"
```

**Comportamento:**
- Números menores que 6 dígitos são completamente descartados
- Não são salvos no banco de dados
- Foto marcada como FALHA

---

### 2. NÃO encontrou número com 6 dígitos → FALHA

```
Exemplo 1: Nenhum número detectado
  AWS detectou: "ABC", "XYZ", "texto qualquer"
  Ação: Marcar como FALHA
  Status: FALHA
  Motivo: "Nenhum número com 6 dígitos encontrado"

Exemplo 2: Apenas números menores
  AWS detectou: "12345" (5 dígitos), "789" (3 dígitos)
  Ação: Marcar como FALHA
  Status: FALHA
  Motivo: "Apenas números com tamanho diferente de 6: 12345 (5 dígitos), 789 (3 dígitos)"
```

**Comportamento:**
- Foto processada mas sem resultado válido
- Status: FALHA
- Pode ser reprocessada (até 3 tentativas)

---

### 3. Encontrou EXATAMENTE 1 número com 6 dígitos → SUCESSO

```
Exemplo:
  AWS detectou: "ABC 123456 DEF", "789", "XYZ"
  Números de 6 dígitos encontrados: 1
  Número: "123456"
  Confiança: 98.5%
  
  Ação: Marcar como SUCESSO
  Status: SUCESSO
  Motivo: "Número único encontrado com confiança adequada"
```

**Comportamento:**
- Número salvo no banco de dados
- Status: SUCESSO
- Não requer revisão manual

---

### 4. Encontrou MÚLTIPLOS números com 6 dígitos → WARNING ⚠️

```
Exemplo:
  AWS detectou: "123456", "789012", "345678"
  Números de 6 dígitos encontrados: 3
  
  Ação: Marcar como WARNING (requer revisão manual)
  Status: WARNING
  
  Salvamento:
    - Número principal: "789012" (maior confiança: 98.5%)
    - Alternativos: [
        { numero: "123456", confidencialidade: 97.2 },
        { numero: "345678", confidencialidade: 96.1 }
      ]
    - Flag: requerRevisao = true
```

**Comportamento:**
- Salva o número com MAIOR confiança como principal
- Salva TODOS os outros números como alternativas
- Status: WARNING
- Flag `requerRevisao: true`
- Não conta como sucesso até ser revisado manualmente

---

## 🗄️ Estrutura no MongoDB

### Schema Foto (atualizado)

```javascript
{
  status: 'warning',  // 'pendente' | 'processando' | 'sucesso' | 'falha' | 'warning'
  
  numeroEncontrado: '789012',  // Número principal (maior confiança)
  confidencialidade: 98.5,
  
  requerRevisao: true,  // Flag de atenção
  
  numerosAlternativos: [
    { numero: '123456', confidencialidade: 97.2 },
    { numero: '345678', confidencialidade: 96.1 }
  ]
}
```

---

## 📊 Fluxo de Decisão

```
AWS Rekognition detecta textos
         │
         ↓
Extrair TODOS os números de 6 dígitos
         │
         ↓
    Quantos foram encontrados?
         │
    ┌────┴────┬────────────┬────────────┐
    │         │            │            │
    0         1            2+           N (< 6 dígitos)
    │         │            │            │
    ↓         ↓            ↓            ↓
  FALHA    SUCESSO      WARNING      IGNORAR
    │         │            │
    │         │            │
    │         │            └─→ Salvar todos os números
    │         │                requerRevisao = true
    │         │
    │         └───────→ Salvar número único
    │
    └─────────────────→ numeroEncontrado = ''
                        Pode tentar novamente (retry)
```

---

## 🔍 Exemplos Práticos

### Caso 1: Foto com Plaqueta Clara

```
Imagem: Plaqueta com "123456" claramente visível
AWS detecta: "123456" (98.5%)

✅ RESULTADO: SUCESSO
   - Número: 123456
   - Confiança: 98.5%
   - Status: sucesso
```

### Caso 2: Foto com Múltiplas Plaquetas

```
Imagem: Duas plaquetas na mesma foto
AWS detecta: "123456" (98.5%), "789012" (97.8%)

⚠️  RESULTADO: WARNING
   - Número principal: 123456 (98.5%)
   - Alternativas: [{ numero: 789012, conf: 97.8 }]
   - Status: warning
   - Requer revisão manual
```

### Caso 3: Foto Borrada

```
Imagem: Plaqueta ilegível
AWS detecta: "12345" (5 dígitos), "6" (1 dígito)

❌ RESULTADO: FALHA
   - Número: (vazio)
   - Status: falha
   - Motivo: "Apenas números com tamanho diferente de 6"
   - Retry: Sim (até 3 tentativas)
```

### Caso 4: Foto com Números Irrelevantes

```
Imagem: Plaqueta "123456" + número de série "78901234"
AWS detecta: "123456" (98.5%), "789012" (95.2% - parte do serial)

⚠️  RESULTADO: WARNING
   - Número principal: 123456 (98.5%)
   - Alternativas: [{ numero: 789012, conf: 95.2 }]
   - Status: warning
   - Requer revisão para confirmar qual é o correto
```

### Caso 5: Foto sem Texto

```
Imagem: Foto em branco ou sem texto
AWS detecta: (nada)

❌ RESULTADO: FALHA
   - Número: (vazio)
   - Status: falha
   - Motivo: "Nenhum texto detectado na imagem"
```

---

## 🛠️ API Endpoints para Warnings

### 1. Listar Fotos com Warning

```bash
GET /api/lotes/:nome/warnings?page=1&limit=50

Response:
{
  "fotos": [
    {
      "idPrisma": "ABC123",
      "linkFoto": "https://drive.google.com/...",
      "numeroPrincipal": {
        "numero": "123456",
        "confidencialidade": 98.5
      },
      "numerosAlternativos": [
        { "numero": "789012", "confidencialidade": 97.2 }
      ],
      "totalAlternativas": 1
    }
  ],
  "paginacao": {
    "paginaAtual": 1,
    "totalPaginas": 3,
    "totalRegistros": 125
  }
}
```

### 2. Estatísticas com Warnings

```bash
GET /api/estatisticas

Response:
{
  "fotos": {
    "total": 1500,
    "sucesso": 1200,
    "falha": 150,
    "pendentes": 25,
    "warning": 125,  ← Novo campo
    "taxaSucesso": "80.00"
  }
}
```

### 3. Status do Lote com Warnings

```bash
GET /api/lotes/:nome/status

Response:
{
  "nome": "lote001",
  "fotosSucesso": 120,
  "fotosFalha": 15,
  "fotosWarning": 10,  ← Novo campo
  ...
}
```

---

## 📝 Logs e Monitoramento

### Log de Warning

```
⚠️  WARNING - Foto ABC123: ATENÇÃO: 3 números encontrados. Requer revisão manual.
   Números alternativos: 123456 (97.2%), 345678 (96.1%)
```

### Log de Falha (sem 6 dígitos)

```
❌ Foto ABC123 FALHOU: Apenas números com tamanho diferente de 6: 12345 (5 dígitos), 789 (3 dígitos)
```

### Log de Sucesso

```
✅ Foto ABC123: Número 123456 detectado (98.5%)
```

---

## 🔄 Fluxo de Revisão Manual

```
1. Consultar fotos com warning:
   GET /api/lotes/lote001/warnings

2. Para cada foto:
   - Visualizar imagem original
   - Verificar número principal
   - Verificar números alternativos
   - Decidir qual é o correto

3. Atualizar manualmente no MongoDB:
   db.fotos.updateOne(
     { idPrisma: "ABC123" },
     { 
       $set: { 
         status: "sucesso",
         numeroEncontrado: "789012",  ← Número correto após revisão
         requerRevisao: false
       }
     }
   )

4. Ou criar endpoint para confirmar:
   PATCH /api/lotes/:nome/fotos/:idPrisma/confirmar
   Body: { numeroCorreto: "789012" }
```

---

## 💡 Recomendações

### Durante Importação
- Analisar fotos com múltiplas plaquetas
- Considerar recortar imagens antes de processar
- Melhorar qualidade das fotos (iluminação, foco)

### Durante Processamento
- Monitorar quantidade de warnings
- Se > 10% warnings: revisar processo de captura
- Criar lote de revisão periódica

### Após Processamento
- Revisar TODOS os warnings antes de entregar
- Documentar decisões de revisão manual
- Atualizar status de 'warning' para 'sucesso'

---

## 🎯 Métricas de Qualidade

```
Taxa ideal:
  - Sucesso: > 90%
  - Falha: < 5%
  - Warning: < 5%
  - Pendentes: 0% (após processamento)

Alerta vermelho:
  - Warning > 10%: Problema na captura das fotos
  - Falha > 10%: Problema na qualidade das imagens
```

---

## 🔐 Validações Implementadas

```javascript
// 1. Confiança mínima
confidencialidade >= 95%

// 2. Quantidade de dígitos
numeroEncontrado.length === 6

// 3. Múltiplos números
numerosAlternativos.length > 0 → WARNING

// 4. Tentativas de retry
tentativas < 3 → Reprocessar
tentativas >= 3 → Falha definitiva
```

---

Este sistema garante precisão nos resultados enquanto identifica automaticamente casos que necessitam de atenção humana! 🎯
