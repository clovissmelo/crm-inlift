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
5. Em **Admin → Integrações → Google Agenda**, informe **Client ID** e **Client Secret** (gravados criptografados no banco, não na Vercel). Redirect URI pode ficar em branco: o CRM monta `https://seu-dominio/api/integrations/google/callback` a partir da URL do site (cadastre essa URI no Google Cloud).
6. `SESSION_SECRET` (ou `GOOGLE_TOKEN_SECRET`) na Vercel/ambiente serve só para **criptografia** de tokens/chaves no Postgres — não são as credenciais Google.
7. Escopo OAuth: `https://www.googleapis.com/auth/calendar.events`.
8. Na mesma página, clique em **Conectar conta Google** para autorizar a conta que sincroniza reuniões.

Tokens ficam armazenados criptografados na tabela `google_calendar_connection`. Falhas de sync não apagam o agendamento local; é possível tentar sincronizar novamente na tela de Agendamentos.

## Outras integrações

- **API4COM** — Admin → Integrações → API4COM (telefonia e webhook).
- **Google Places** — Admin → Integrações → Google Places (chave criptografada em `system_settings`, limites diários/por execução).
- **Novos leads (postos ANP)** — Admin → Novos leads. Motor portado de `contabilidade-leads-pilot` (RS/PR). No plano Hobby, o progresso avança enquanto a tela faz polling da execução; opcionalmente use `/api/cron/lead-generation` (1×/dia no Hobby) ou cron frequente no Pro.

### Geração de leads — deploy

1. Aplique a migração `migrations/023_lead_generation_pipeline.sql` (ou rode `npm run migrate` apontando para o Supabase).
2. **Vercel:** defina `SESSION_SECRET` (sessão + criptografia no banco). `CRON_SECRET` só se configurar cron manual (ex. Pro). Chaves Google vão pelo admin, não por env.
3. **Supabase:** apenas `POSTGRES_URL`; nenhuma extensão extra.
4. **Interface:** configure Google Places (opcional) → Novos leads → prévia ANP → iniciar. Modo simulação padrão (`lead_generation_simulation_default=1`) evita Google até você desmarcar na tela e confirmar cobranças.
5. **Piloto real (ex.: 5 postos):** desative simulação, `max_stations=5`, `max_google_calls=10`, confirme cobranças. Custo Google ≈ 2 chamadas/posto (Find + Details; valores na tabela de preços Places do Google).
6. **Verificação:** execução #id com progresso &lt; 100% até `finalizing`; novos clientes em abas “Novos” e fila **Prospecção** (`in_prospeccao_queue`).

## Produção

Defina `SESSION_SECRET` e **`POSTGRES_URL`** (ou `DATABASE_URL`) no ambiente. Na Vercel com integração Supabase, `POSTGRES_URL` costuma ser preenchida automaticamente. Credenciais Google (Agenda e Places) ficam em **Admin → Integrações**.
