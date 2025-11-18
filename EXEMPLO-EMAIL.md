# 📧 Exemplo de Email Atualizado - ProjLuz v2.0

## Visual do Email Enviado

---

### **Assunto:** ✅ Processamento lote_001.xlsx - Concluído

---

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│           📊 Processamento Concluído                   │
│                                                        │
│           Lote: lote_001.xlsx                          │
│                                                        │
└────────────────────────────────────────────────────────┘

⏰ Data/Hora: 18/11/2025 14:30:45

┌────────────────────────────────────────────────────────┐
│  📈 Estatísticas do Processamento                      │
├────────────────────────────────────────────────────────┤
│                                                        │
│  📸 Total de fotos analisadas:              1.250      │
│  ✅ Sucesso:                       1.180 (94.40%)      │
│  ❌ Falhas:                           70 (5.60%)       │
│  ⏱️ Tempo total:                        42min 15s      │
│  📈 Média por foto:                          2.03s     │
│                                                        │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  🔗 Links Úteis                                        │
├────────────────────────────────────────────────────────┤
│                                                        │
│  📥 Exportar Resultados (CSV)                          │
│  ┌──────────────────────────────────────┐             │
│  │  ⬇️ Baixar CSV Completo               │             │
│  └──────────────────────────────────────┘             │
│  GET /api/lotes/lote_001/export                        │
│                                                        │
│  ────────────────────────────────────────              │
│                                                        │
│  📊 Detalhes do Lote                                   │
│  → Ver informações completas                           │
│  GET /api/lotes/lote_001                               │
│                                                        │
│  ────────────────────────────────────────              │
│                                                        │
│  📸 Ver Fotos Processadas                              │
│  → Listar todas as fotos                               │
│  GET /api/lotes/lote_001/fotos?status=sucesso          │
│                                                        │
│  ────────────────────────────────────────              │
│                                                        │
│  ⏱️ Status em Tempo Real                               │
│  → Monitorar progresso                                 │
│  GET /api/lotes/lote_001/status                        │
│                                                        │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  💡 Dica                                               │
│                                                        │
│  Use os links acima para acessar os resultados         │
│  diretamente pela API REST. O arquivo CSV pode ser     │
│  baixado clicando no botão "Baixar CSV Completo".      │
└────────────────────────────────────────────────────────┘

─────────────────────────────────────────────────────────
Sistema de Processamento de Imagens - Projluz
Este é um email automático, não responda.
─────────────────────────────────────────────────────────
```

---

## 🔗 Links Funcionais no Email

### 1. **Baixar CSV Completo** (Botão Principal)
```
http://localhost:3000/api/lotes/lote_001/export
```
- **Ação:** Download imediato do CSV com todos os resultados
- **Formato:** `resultado_lote_001.csv`
- **Colunas:** 
  - `id_prisma`
  - `link_foto_plaqueta`
  - `numero_encontrado`
  - `confidencialidade`
  - `status`

---

### 2. **Detalhes do Lote**
```
http://localhost:3000/api/lotes/lote_001
```
**Response JSON:**
```json
{
  "nome": "lote_001",
  "status": "concluido",
  "totalFotos": 1250,
  "fotosSucesso": 1180,
  "fotosFalha": 70,
  "percentualSucesso": 94.40,
  "custoRealAWS": 1.250,
  "tempoTotalProcessamento": 2535000,
  "tempoMedioPorFoto": 2027,
  "dataCriacao": "2025-11-18T10:00:00.000Z",
  "dataConclusao": "2025-11-18T10:42:15.000Z"
}
```

---

### 3. **Ver Fotos Processadas**
```
http://localhost:3000/api/lotes/lote_001/fotos?status=sucesso
```
**Response JSON:**
```json
{
  "fotos": [
    {
      "idPrisma": "ABC123",
      "linkFotoOriginal": "https://drive.google.com/...",
      "numeroEncontrado": "123456",
      "confidencialidade": 98.5,
      "status": "sucesso",
      "custoAWS": 0.001,
      "tempoTotal": 2050
    },
    // ... mais 1179 fotos
  ],
  "paginacao": {
    "paginaAtual": 1,
    "totalPaginas": 24,
    "totalRegistros": 1180,
    "limite": 50
  }
}
```

**Filtros Disponíveis:**
- `?status=sucesso` - Apenas fotos processadas com sucesso
- `?status=falha` - Apenas fotos com erro
- `?status=pendente` - Fotos aguardando processamento
- `?page=2&limit=100` - Paginação customizada

---

### 4. **Status em Tempo Real**
```
http://localhost:3000/api/lotes/lote_001/status
```
**Response JSON:**
```json
{
  "nome": "lote_001",
  "status": "concluido",
  "fotosProcessadas": 1250,
  "fotosSucesso": 1180,
  "fotosFalha": 70,
  "fotosPendentes": 0,
  "percentualConcluido": "100.00",
  "tempoDecorrido": 2535,
  "custoReal": 1.250
}
```

---

## 🎯 Diferenças da Versão Anterior

### ❌ Versão Antiga (v1.0)
- Arquivo CSV anexado no email (limite de tamanho)
- Sem links interativos
- Informações estáticas
- Arquivo local necessário

### ✅ Versão Nova (v2.0)
- **Links da API REST** (sem limite de tamanho)
- Download on-demand via endpoint
- Informações em tempo real
- Acesso direto aos dados no MongoDB
- Múltiplos endpoints para diferentes necessidades
- Filtros e paginação

---

## 📊 Casos de Uso

### Usuário Final
1. Recebe email com resumo
2. Clica no botão "Baixar CSV Completo"
3. Abre Excel/Google Sheets com os resultados

### Desenvolvedor/Analista
1. Usa endpoint `/api/lotes/lote_001` para análise detalhada
2. Consulta fotos específicas com filtros
3. Monitora processamento em tempo real
4. Integra com outras ferramentas via API

### Sistema Automatizado
1. Recebe webhook de conclusão (futuro)
2. Faz GET no endpoint de exportação
3. Processa CSV automaticamente
4. Atualiza sistema downstream

---

## 🔧 Configuração

### Variável de Ambiente
```env
# .env
API_BASE_URL=http://localhost:3000

# Em produção:
# API_BASE_URL=https://api.projluz.com
```

### Código Atualizado
```javascript
// src/services/emailService.js
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const loteUrl = `${API_BASE_URL}/api/lotes/${nomeLote}`;
const exportUrl = `${API_BASE_URL}/api/lotes/${nomeLote}/export`;
const statusUrl = `${API_BASE_URL}/api/lotes/${nomeLote}/status`;
const fotosUrl = `${API_BASE_URL}/api/lotes/${nomeLote}/fotos`;
```

---

## 🚀 Deploy em Produção

Quando fizer deploy, atualizar `.env`:

```env
API_BASE_URL=https://api.projluz.com
```

Os emails automaticamente usarão:
```
https://api.projluz.com/api/lotes/lote_001/export
https://api.projluz.com/api/lotes/lote_001
...
```

---

## ✅ Benefícios

1. **Sem Anexos** - Emails mais leves e rápidos
2. **Sempre Atualizado** - Links apontam para dados em tempo real
3. **Escalável** - Funciona com qualquer tamanho de lote
4. **Rastreável** - Logs de acesso aos endpoints
5. **Flexível** - Múltiplas formas de acessar os dados
6. **Integrável** - Fácil integração com outros sistemas

---

**Documentação gerada em:** 18/11/2025
**Versão do Sistema:** v2.0
