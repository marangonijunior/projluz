# Projluz - Sistema de Processamento de Imagens

Sistema Node.js automatizado para processar imagens do Google Drive, extrair números de 6 dígitos usando AWS Rekognition e gerar relatórios de processamento.

## 📋 Características

- ✅ Processamento automático a cada 24 horas
- ✅ Extração de texto (OCR) com AWS Rekognition
- ✅ Validação de confiança mínima (95%)
- ✅ Processamento sequencial (uma foto por vez)
- ✅ Atualização incremental de resultados
- ✅ Envio de relatório por email
- ✅ Sistema de logs detalhado
- ✅ Recuperação automática de falhas

## 🚀 Instalação

### Pré-requisitos

- Node.js 18+ instalado
- Conta AWS com acesso ao Rekognition
- Conta Google Cloud com API do Drive habilitada
- Servidor SMTP para envio de emails

### Passo 1: Clone o repositório

```bash
git clone https://github.com/marangonijunior/projluz.git
cd projluz
```

### Passo 2: Instale as dependências

```bash
npm install
```

### Passo 3: Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais:

```env
# AWS
AWS_ACCESS_KEY_ID=sua_access_key
AWS_SECRET_ACCESS_KEY=sua_secret_key
AWS_REGION=us-east-1

# Google Drive
GOOGLE_DRIVE_FOLDER_ID=id_da_pasta_principal
GOOGLE_CREDENTIALS_PATH=./credentials/google-credentials.json

# Email
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_app
EMAIL_TO=destinatario@empresa.com
```

### Passo 4: Adicione as credenciais do Google

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/)
2. Habilite a Google Drive API
3. Crie uma Service Account
4. Baixe o arquivo JSON de credenciais
5. Salve como `credentials/google-credentials.json`

## 📝 Estrutura do Projeto

```
projluz/
├── src/
│   ├── config/           # Configurações
│   │   ├── aws.js
│   │   ├── google-drive.js
│   │   └── email.js
│   ├── services/         # Serviços principais
│   │   ├── driveService.js
│   │   ├── rekognitionService.js
│   │   ├── csvService.js
│   │   └── emailService.js
│   ├── controllers/      # Lógica de negócio
│   │   └── batchProcessor.js
│   ├── utils/            # Utilitários
│   │   ├── logger.js
│   │   ├── validator.js
│   │   └── fileNameExtractor.js
│   └── index.js          # Ponto de entrada
├── credentials/          # Credenciais (não versionado)
├── logs/                 # Logs da aplicação
├── .env                  # Variáveis de ambiente
├── .env.example          # Exemplo de configuração
├── package.json
└── ESPECIFICACAO.md      # Documentação completa
```

## 🎯 Como Usar

### Executar em modo desenvolvimento

```bash
npm run dev
```

### Executar em produção

```bash
npm start
```

### Formato do CSV de Entrada

O arquivo `input.csv` deve estar em cada subpasta do lote:

```csv
id,file_url
1,https://drive.usercontent.google.com/download?id=FILE_ID_1&authuser=0
2,https://drive.usercontent.google.com/download?id=FILE_ID_2&authuser=0
3,https://drive.usercontent.google.com/download?id=FILE_ID_3&authuser=0
```

### Formato do CSV de Saída

O sistema gera `resultado.csv` na mesma pasta do lote:

```csv
id,file_id,numero_encontrado,confidencialidade,falhou
1,FILE_ID_1,123456,98.5,false
2,FILE_ID_2,12345,97.2,true
3,FILE_ID_3,789012,92.1,true
```

## ⚙️ Configurações

### Scheduler

Por padrão, executa todo dia à meia-noite. Para alterar:

```env
CRON_SCHEDULE=0 0 * * *
```

Exemplos:
- `0 0 * * *` - Todo dia à meia-noite
- `0 */6 * * *` - A cada 6 horas
- `*/5 * * * *` - A cada 5 minutos (para testes)

### Critérios de Validação

```env
MIN_CONFIDENCE=95      # Confiança mínima (%)
DIGIT_LENGTH=6         # Quantidade de dígitos
```

## 📧 Email de Resumo

Ao final de cada lote, o sistema envia um email com:

- Total de fotos analisadas
- Quantidade de sucessos e falhas
- Percentuais
- Tempo total de processamento
- Média por foto

## 📊 Logs

Os logs são salvos em `logs/processamento_YYYYMMDD.log` e incluem:

- Timestamp de cada operação
- Lote sendo processado
- Foto atual
- Status (sucesso/falha)
- Erros detalhados

## 🔒 Segurança

- ✅ Credenciais em variáveis de ambiente
- ✅ Arquivo `.gitignore` configurado
- ✅ Credenciais do Google não versionadas
- ✅ Validação de inputs
- ✅ Tratamento de erros robusto

## 🐛 Troubleshooting

### Erro de autenticação AWS

Verifique se as credenciais estão corretas em `.env`

### Erro ao acessar Google Drive

Certifique-se de que:
1. A Service Account tem permissão na pasta
2. O arquivo de credenciais está no caminho correto
3. A Google Drive API está habilitada

### Email não está sendo enviado

- Para Gmail, use uma senha de aplicativo (não sua senha normal)
- Habilite "Acesso a apps menos seguros" ou use OAuth2

## 📄 Licença

ISC

## 👨‍💻 Autor

Desenvolvido para processamento em lote de imagens com OCR.

---

Para mais detalhes, veja [ESPECIFICACAO.md](./ESPECIFICACAO.md)
