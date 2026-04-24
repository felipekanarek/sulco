# Deploy — Sulco Piloto (Vercel + Turso + Clerk)

Roteiro para publicar o Sulco em produção. Stack: **Vercel** (hosting +
cron), **Turso** (libsql gerenciado) e **Clerk** (auth).

> ⚠️ **Nota de segurança (abril/2026)**: após o incidente Vercel × Context.ai,
> marque **todas** as env vars como **Sensitive** ao criá-las. O default agora
> já é sensitive, mas confira caso-a-caso. Rotacione segredos periodicamente.

---

## 1. Pré-requisitos

- Conta GitHub com o repositório do Sulco
- Conta Vercel conectada ao GitHub
- Conta Turso (`turso auth signup`)
- Aplicação Clerk separada para produção (NÃO reaproveitar keys de dev)
- Conta Discogs com Personal Access Token (você usa o seu no onboarding)

Instale o CLI do Turso localmente:

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
```

---

## 2. Provisionar Turso

```bash
# Cria o DB na região mais próxima do usuário (GRU = São Paulo se disponível)
turso db create sulco-prod --location gru

# Captura URL e authToken
turso db show sulco-prod --url
# libsql://sulco-prod-<org>.turso.io
turso db tokens create sulco-prod
# eyJhbGciOi...  (guarde — não aparece de novo)
```

Guarde os dois valores — vão como env vars na Vercel.

### Aplicar o schema

Localmente, com as env vars apontando pro Turso:

```bash
DATABASE_URL='libsql://sulco-prod-<org>.turso.io' \
DATABASE_AUTH_TOKEN='<token-turso>' \
npm run db:push
```

> `drizzle.config.ts` detecta `libsql://` e usa o dialect `turso`
> automaticamente.

**Não rode seed em prod.** O onboarding real cria os dados via Discogs.

---

## 3. Configurar Clerk (prod)

1. Crie uma **nova application** em https://dashboard.clerk.com
2. Em *Customization → Localization*, aplique `ptBR`
3. Copie `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY`
4. Configure o webhook em *Webhooks → Add Endpoint*:
   - URL: `https://<seu-dominio>.vercel.app/api/webhooks/clerk`
     (preencha depois que o deploy subir — Vercel atribui domínio na primeira
     implantação)
   - Eventos: `user.created`, `user.updated`, `user.deleted`
   - Copie o **signing secret** → `CLERK_WEBHOOK_SECRET`

---

## 4. Gerar segredos locais

```bash
# Cifragem AES-256-GCM do PAT Discogs (FR-004)
openssl rand -base64 32
# → MASTER_ENCRYPTION_KEY

# Autenticação do cron
openssl rand -base64 32
# → CRON_SECRET
```

Guarde — são novos, **não reutilize os de dev**.

---

## 5. Deploy na Vercel

### 5.1. Criar projeto

1. https://vercel.com/new → escolha o repositório
2. Framework Preset: **Next.js** (autodetectado)
3. Build Command / Output: deixar default
4. **Não** clique em Deploy ainda — configure env vars primeiro

### 5.2. Env Vars (Production + Preview)

Na aba *Settings → Environment Variables*, adicione **marcando cada uma como Sensitive**:

| Nome                              | Valor                                            | Escopo       |
|-----------------------------------|--------------------------------------------------|--------------|
| `DATABASE_URL`                    | `libsql://sulco-prod-<org>.turso.io`             | Prod+Preview |
| `DATABASE_AUTH_TOKEN`             | token do Turso                                   | Prod+Preview |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | pk_live_...                                    | Prod+Preview |
| `CLERK_SECRET_KEY`                | sk_live_...                                      | Prod+Preview |
| `CLERK_WEBHOOK_SECRET`            | whsec_...                                        | Prod         |
| `MASTER_ENCRYPTION_KEY`           | base64 (32 bytes decodificados)                  | Prod+Preview |
| `CRON_SECRET`                     | base64                                           | Prod         |
| `OWNER_EMAIL`                     | email do owner (mesmo cadastrado no Clerk Allowlist) | Prod+Preview |

> `NEXT_PUBLIC_*` ficam expostas no bundle — é o design da Clerk (publishable
> key é pública por natureza). Demais **precisam** ser sensitive.
>
> `OWNER_EMAIL` (002-multi-conta): identifica o dono do piloto. Primeiro
> user com email verificado igual a esse valor ganha `users.is_owner=true`
> automaticamente via webhook Clerk (ver [docs/convites.md](convites.md)).
> Não precisa ser sensitive — é um identificador, não um segredo.

### 5.3. Deploy inicial

Clique em **Deploy**. Após conclusão:

1. Copie o domínio (`https://<projeto>.vercel.app`)
2. Volte à Clerk → *Webhooks* → atualize a URL do endpoint com esse domínio
3. Volte à Clerk → *Domains* → adicione o mesmo domínio

### 5.4. Cron

O `vercel.json` já declara:

```json
{
  "crons": [
    { "path": "/api/cron/sync-daily", "schedule": "0 7 * * *" }
  ]
}
```

A Vercel injeta automaticamente `Authorization: Bearer $CRON_SECRET` no
request (porque `CRON_SECRET` está nas env vars). Verifique em *Project →
Logs* após as 04:00 SP do dia seguinte.

---

## 6. Primeiro acesso

1. Acesse `https://<projeto>.vercel.app` → redireciona para `/sign-in`
2. Crie sua conta (use o email que você quer como dono do piloto)
3. Clerk dispara webhook → linha criada em `users`
4. `/onboarding` solicita username Discogs + PAT
5. Import inicial começa — ~42 min para 2500 discos (progress bar na home)
6. Após concluir, siga o [quickstart-walkthrough.md](quickstart-walkthrough.md)
   para validar cada tela

---

## 7. Domínio customizado (opcional)

1. *Settings → Domains* → adicione `sulco.exemplo.com`
2. Configure CNAME/A record no seu DNS
3. Atualize **Clerk → Domains** com o novo domínio
4. Atualize **Clerk → Webhooks** endpoint para `https://sulco.exemplo.com/api/webhooks/clerk`

---

## 8. Manutenção

### Rotacionar credenciais

```bash
# Turso: criar novo token e revogar o antigo
turso db tokens create sulco-prod
turso db tokens invalidate sulco-prod --token <old>

# Atualizar env var na Vercel e fazer redeploy
```

### Backup

```bash
# Dump periódico do Turso
turso db shell sulco-prod .dump > backup-$(date +%Y-%m-%d).sql
```

Rode em cron local (macOS `launchd` ou GitHub Actions `schedule`) e guarde
em storage privado.

### Migrations futuras

Ao mudar `src/db/schema.ts`:

```bash
DATABASE_URL='libsql://sulco-prod-<org>.turso.io' \
DATABASE_AUTH_TOKEN='<token>' \
npm run db:push
```

Aplicar **antes** do deploy novo (Vercel roda `next build` — não toca no
schema). Em caso de mudanças destrutivas, use `drizzle-kit generate` + migração
manual revisada.

---

## 9. Checklist de go-live

- [ ] Turso `sulco-prod` criado + schema aplicado
- [ ] Clerk prod application com webhook configurado
- [ ] Todas as 7 env vars configuradas na Vercel, **todas sensitive**
- [ ] Deploy de prod sem erros (logs em *Deployments*)
- [ ] `/` responde com redirect para `/sign-in`
- [ ] Signup cria linha em `users` (webhook funcionando)
- [ ] Onboarding salva credencial Discogs criptografada
- [ ] Import inicial progride (banner na home)
- [ ] `/status` registra o run
- [ ] Cron `0 7 * * *` UTC visível em *Project → Crons*
- [ ] (Opcional) Domínio custom ativo com SSL válido

---

## 10. Rollback

Rollback é nativo na Vercel: *Deployments → revert* para qualquer deploy
anterior. Banco não é afetado — se a migração der problema, faça o
roll-forward (nova migration corrigindo) em vez de reverter schema.
