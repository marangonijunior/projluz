# ✅ Preservação de Zeros à Esquerda

## 🎯 Problema Resolvido

Números de 6 dígitos que começam com zero (ex: `012345`) estavam sendo convertidos para número inteiro (`12345`), perdendo o zero inicial.

## 🔧 Solução Implementada

### Regra: **SEMPRE STRING, NUNCA NUMBER**

Todos os números detectados são tratados como **STRING** em todo o fluxo, desde a extração até a exportação CSV.

---

## 📦 Arquivos Modificados

### 1. `src/utils/validator.js`

```javascript
// ANTES (implícito)
extractDigits("ABC 012345 DEF") // → "012345" (string)

// AGORA (explícito)
extractDigits("ABC 012345 DEF") // → "012345" (STRING garantida)
// Comentário adicionado: "SEMPRE String para preservar zeros à esquerda"
```

### 2. `src/services/rekognitionService.js`

```javascript
// Todos os retornos de número agora usam String()

// Caso 1: Sucesso
return {
  number: String(result.text), // ✅ "012345" preservado
  ...
}

// Caso 2: Warning (múltiplos números)
return {
  number: String(principal.text), // ✅ "012345" preservado
  alternativeNumbers: alternatives.map(n => ({
    numero: String(n.text), // ✅ "009876" preservado
    ...
  }))
}
```

### 3. `src/models/Foto.js`

```javascript
// Schema MongoDB
numeroEncontrado: {
  type: String,  // ✅ SEMPRE String
  default: ''    // Não null, mas string vazia
}
```

### 4. `src/services/csvService.js`

```javascript
// createResultRecord()
return {
  ...
  numero_encontrado: String(number || ''), // ✅ Força conversão
  ...
}

// arrayToCsvString()
if (header === 'numero_encontrado' && value) {
  value = String(value); // ✅ Garante string no CSV
}
```

### 5. `src/api/controllers/loteController.js`

```javascript
// exportarCsv()
const dados = fotos.map(foto => ({
  ...
  numero_encontrado: String(foto.numeroEncontrado || ''), // ✅ String garantida
  ...
}));
```

---

## ✅ Garantias Implementadas

### 1. Extração (AWS Rekognition)
```javascript
detectText() → "ABC 012345 DEF"
extractDigits() → "012345" (STRING)
```

### 2. Validação
```javascript
digits.length === 6 // ✅ Funciona com string
"012345".length === 6 // true
```

### 3. Armazenamento (MongoDB)
```javascript
{
  numeroEncontrado: "012345", // ✅ Salvo como string
  type: String                // ✅ Schema garante tipo
}
```

### 4. Exportação (CSV)
```javascript
numero_encontrado
"012345"           // ✅ Zero preservado
"001234"           // ✅ Dois zeros preservados
"000123"           // ✅ Três zeros preservados
```

---

## 🧪 Exemplos de Teste

### Caso 1: Um Zero à Esquerda
```
Input: Imagem com "012345"
AWS detecta: "012345"

Fluxo:
  1. extractDigits("012345") → "012345" (string)
  2. MongoDB: { numeroEncontrado: "012345" }
  3. CSV: numero_encontrado = "012345"

✅ Zero preservado em todas as etapas
```

### Caso 2: Múltiplos Zeros
```
Input: Imagem com "000123"
AWS detecta: "000123"

Fluxo:
  1. extractDigits("000123") → "000123" (string)
  2. MongoDB: { numeroEncontrado: "000123" }
  3. CSV: numero_encontrado = "000123"

✅ Três zeros preservados
```

### Caso 3: Warning com Zero
```
Input: Duas plaquetas "012345" e "009876"
AWS detecta: ["012345", "009876"]

Fluxo:
  1. findAllNumbersWithDigits() → [
       { text: "012345", confidence: 98.5 },
       { text: "009876", confidence: 97.2 }
     ]
  2. MongoDB: {
       numeroEncontrado: "012345",
       numerosAlternativos: [
         { numero: "009876", confidencialidade: 97.2 }
       ]
     }
  3. CSV: numero_encontrado = "012345"

✅ Zeros preservados em número principal e alternativos
```

### Caso 4: Sem Zeros
```
Input: Imagem com "123456"
AWS detecta: "123456"

Fluxo:
  1. extractDigits("123456") → "123456" (string)
  2. MongoDB: { numeroEncontrado: "123456" }
  3. CSV: numero_encontrado = "123456"

✅ Funciona normalmente (sem impacto)
```

---

## 📊 Formato do CSV Exportado

### Estrutura
```csv
id_prisma,link_foto_plaqueta,numero_encontrado,confidencialidade,status
ABC001,https://drive.google.com/...,012345,98.50,sucesso
ABC002,https://drive.google.com/...,000123,97.20,sucesso
ABC003,https://drive.google.com/...,123456,99.10,sucesso
ABC004,https://drive.google.com/...,,0.00,falha
ABC005,https://drive.google.com/...,009876,98.30,warning
```

### Observações
- ✅ Campo `numero_encontrado` é texto (não número)
- ✅ Zeros à esquerda preservados
- ✅ String vazia quando não encontrado (não null ou 0)
- ✅ Excel/Google Sheets tratarão como texto

---

## 🔍 Verificação

### Query MongoDB
```javascript
// Buscar números com zero à esquerda
db.fotos.find({
  numeroEncontrado: /^0/ // Regex: começa com zero
})

// Exemplo de resultado:
{
  _id: ObjectId("..."),
  numeroEncontrado: "012345", // ✅ String com zero
  confidencialidade: 98.5
}
```

### Teste no CSV
```bash
# Exportar CSV
curl http://localhost:3000/api/lotes/lote001/export -o resultado.csv

# Verificar conteúdo
cat resultado.csv | grep "^.*,012345,"

# Saída esperada:
ABC001,https://...,012345,98.50,sucesso
```

### Teste no Excel
```
1. Abrir CSV no Excel
2. Selecionar coluna "numero_encontrado"
3. Formatar como "Texto" (não "Número")
4. Verificar: "012345" deve aparecer com zero

⚠️ Se Excel remover zero automaticamente:
   - Importar como dados (Dados > De Texto/CSV)
   - Definir coluna como "Texto" no assistente
```

---

## 🎯 Checklist de Validação

- ✅ `extractDigits()` retorna string
- ✅ `findAllNumbersWithDigits()` retorna `text: string`
- ✅ `extractNumberFromImage()` retorna `number: string`
- ✅ MongoDB schema: `numeroEncontrado: String`
- ✅ `createResultRecord()` força `String(number)`
- ✅ `arrayToCsvString()` trata numero_encontrado como string
- ✅ API `exportarCsv()` força `String(foto.numeroEncontrado)`
- ✅ CSV exportado preserva zeros

---

## 💡 Boas Práticas Implementadas

### 1. Conversão Explícita
```javascript
// SEMPRE usar String() ao retornar número
return String(digits); // ✅ Bom
return digits;         // ⚠️ Pode virar number em alguns contextos
```

### 2. Tipagem MongoDB
```javascript
// Schema explícito
numeroEncontrado: {
  type: String, // ✅ Explícito
  default: ''   // ✅ String vazia (não null)
}
```

### 3. Comentários Claros
```javascript
// Adicionar comentários em pontos críticos
numero_encontrado: String(number || ''), // SEMPRE STRING para preservar zeros
```

### 4. Validação de Tipo
```javascript
// Sempre validar antes de usar
if (typeof numero !== 'string') {
  numero = String(numero);
}
```

---

## 🚨 Pontos de Atenção

### ⚠️ Excel pode remover zeros
**Solução**: Importar CSV como texto, não abrir diretamente

### ⚠️ Comparações numéricas
```javascript
// ❌ ERRADO
if (numeroEncontrado == 12345) // "012345" == 12345 → true (coerção)

// ✅ CORRETO
if (numeroEncontrado === "012345") // Comparação de strings
```

### ⚠️ JSON.stringify
```javascript
// Números começam com zero são strings
JSON.stringify({ numero: "012345" })
// → '{"numero":"012345"}' ✅ Preserva zero
```

---

## 📈 Impacto

### Antes
```
Input: 012345
MongoDB: 12345 (number)
CSV: 12345
Excel: 12345
❌ Zero perdido
```

### Depois
```
Input: 012345
MongoDB: "012345" (string)
CSV: "012345"
Excel: 012345 (se importado como texto)
✅ Zero preservado
```

---

## 🎉 Resultado

✅ **Zeros à esquerda preservados em todo o fluxo**
✅ **Compatível com todas as funções existentes**
✅ **CSV exportado correto**
✅ **Sem quebra de funcionalidade**

---

Para testes:
```bash
# Processar lote
npm start

# Verificar MongoDB
mongosh projluz
db.fotos.find({ numeroEncontrado: /^0/ }).pretty()

# Exportar CSV
curl http://localhost:3000/api/lotes/lote001/export -o teste.csv
cat teste.csv | head -20
```
