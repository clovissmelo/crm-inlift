# FUNON

**Da prospecção ao fechamento** — CRM interno (projeto em `crm-inlift`).

Etapas: cadastro de base, importação e organização de leads; **abordagens, retornos, scripts, histórico e dashboard** (migração `002_funon_abordagens_retornos.sql`); **agendamentos comerciais e Google Agenda/Meet opcional** (migração `003_meetings_google.sql`); **funil Kanban, oportunidades, propostas e conversões** (migração `004_opportunities_pipeline.sql`).

## Requisitos

- Node.js 20+
- PostgreSQL 14+

## Configuração

1. Copie o arquivo de ambiente:

```bash
cp .env.example .env.local
```

2. Configure a conexão PostgreSQL em `.env.local`:
   - **`POSTGRES_URL`** — preferencial (mesma variável da integração Supabase + Vercel).
   - **`DATABASE_URL`** — alternativa para desenvolvimento local (ex.: banco `crm_inlift` no PostgreSQL da máquina).
   - Se nenhuma estiver definida, o app usa um Postgres local padrão **somente fora de produção**.

3. Instale dependências:

```bash
npm install
```

4. Aplique migrações:

```bash
npm run migrate
```

5. Crie o **primeiro usuário administrador** (somente quando ainda não existir nenhum usuário). Use variáveis de ambiente — **não** commite senha no repositório:

**Windows (PowerShell):**

```powershell
$env:ADMIN_NAME="Administrador"
$env:ADMIN_EMAIL="seu@email.com.br"
$env:ADMIN_PASSWORD="senha-forte-com-8-caracteres"
npm run create-admin
```

**Linux/macOS:**

```bash
ADMIN_NAME="Administrador" ADMIN_EMAIL="seu@email.com.br" ADMIN_PASSWORD="senha-forte-com-8-caracteres" npm run create-admin
```

O script recusa executar se já houver usuários ou se o e-mail já existir.

6. Execute localmente:

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Servidor após build |
| `npm run lint` | ESLint |
| `npm run migrate` | Aplica SQL em `migrations/` |
| `npm run create-admin` | Primeiro usuário (via env) |

## Estrutura principal

- `migrations/` — esquema PostgreSQL
- `src/lib/` — banco, auth, regras de clientes/importação
- `src/app/(app)/` — telas autenticadas
- `src/app/api/` — APIs REST
- `public/uploads/avatars/` — fotos de perfil (gitignored, exceto `.gitkeep`)

## Google Agenda e Google Meet (opcional)

Os agendamentos funcionam **localmente** sem Google. Para criar eventos no calendário e gerar link do Meet:

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto (ou use um existente).
2. Ative a **Google Calendar API**.
3. Em **APIs e serviços → Credenciais**, crie credencial **OAuth 2.0 – Aplicativo da Web**.
4. **URIs de redirecionamento autorizados** (exemplo em desenvolvimento):
   - `http://localhost:3000/api/integrations/google/callback`
   - Em produção, use a URL HTTPS do seu domínio com o mesmo caminho `/api/integrations/google/callback`.
5. Defina no `.env.local` (somente no servidor, nunca no repositório):
   - `GOOGLE_CLIENT_ID` — ID do cliente OAuth
   - `GOOGLE_CLIENT_SECRET` — segredo do cliente
   - `GOOGLE_REDIRECT_URI` — deve coincidir **exatamente** com a URI cadastrada no Google (ex.: `http://localhost:3000/api/integrations/google/callback`)
   - `GOOGLE_TOKEN_SECRET` (recomendado) — chave para criptografar refresh tokens no banco; se omitida, usa `SESSION_SECRET`
6. Escopo OAuth usado pelo app: `https://www.googleapis.com/auth/calendar.events` (criar/editar/cancelar eventos e solicitar Google Meet).
7. Reinicie o servidor, acesse **Cadastros → Integrações** e clique em **Conectar conta Google**. A conta conectada passa a ser usada para sincronizar reuniões criadas no CRM.

Tokens ficam armazenados criptografados na tabela `google_calendar_connection`. Falhas de sync não apagam o agendamento local; é possível tentar sincronizar novamente na tela de Agendamentos.

## Outras integrações

- **API4COM** — botão Ligar usa `tel:` provisoriamente; não registra chamada concluída.

## Produção

Defina `SESSION_SECRET` e **`POSTGRES_URL`** (ou `DATABASE_URL`) no ambiente. Na Vercel com integração Supabase, `POSTGRES_URL` costuma ser preenchida automaticamente. Use HTTPS para cookies seguros (`NODE_ENV=production`) e configure `GOOGLE_REDIRECT_URI` com HTTPS.
