# Quickstart — Sulco Piloto

Guia curto para rodar o piloto localmente e exercitar a rota feliz de cada
User Story.

---

## 1. Pré-requisitos

- Node.js 20+ (`node --version` deve começar com `v20`).
- `npm` (vem com Node).
- Conta Clerk gratuita com aplicação criada
  (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY`).
- Conta Discogs com Personal Access Token gerado em
  https://www.discogs.com/settings/developers.

---

## 2. Setup inicial

```bash
git clone <repo>
cd sulco
npm install

cp .env.example .env.local
# editar .env.local com:
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
#   CLERK_SECRET_KEY=...
#   CLERK_WEBHOOK_SECRET=...   (gerar depois de criar o endpoint no Clerk)
#   MASTER_ENCRYPTION_KEY=$(openssl rand -base64 32)
#   CRON_SECRET=$(openssl rand -base64 32)
#   DATABASE_URL=file:./sulco.db

npm run db:push    # aplica schema
npm run db:seed    # 30 discos de exemplo + vocabulary seeds
npm run dev        # http://localhost:3000
```

---

## 3. Rota feliz — US1 (entrar e ver a coleção)

1. Abrir http://localhost:3000 → redirecionado para `/sign-in`.
2. Criar conta pelo formulário Clerk (email + senha ou social).
3. Pós-signup → redirecionado para `/onboarding`.
4. Preencher `discogsUsername` + Personal Access Token → **Salvar**.
5. Sistema valida o token (chamada de teste à Discogs) e dispara import
   inicial em background.
6. Vai para `/` — listagem cresce em tempo real conforme discos entram.
7. Aplicar filtros: `status = unrated` (default), gênero, texto livre,
   tri-estado Bomba.
8. Logout (menu do header) + login → dados preservados.

**Sinais de sucesso**:
- Listagem mostra capa + metadata em ≤ 45 min para 2500 discos (SC-002).
- Badge no header só aparece se sync falhou ou há conflitos pendentes.

---

## 4. Rota feliz — US2 (triar e curar)

1. Na listagem, clicar "Curadoria →" em qualquer disco, ou acessar
   `/curadoria`.
2. Filtro padrão `unrated`. Disco exibido com tracklist.
3. Atalhos:
   - `A` → marca `active` e avança.
   - `D` → marca `discarded` e avança.
   - `→` → pula sem alterar.
   - `←` → volta (preservando o que foi salvo).
4. Abrir um disco `active` em `/disco/[id]`:
   - `Espaço` na faixa focada → toggle `selected`.
   - Preencher BPM, Camelot (picker visual), energia, moods, contexts, Bomba.
5. Retornar à listagem → disco aparece na cor/estado atualizado.

**Sinais de sucesso**:
- Triar 100 discos < 30 min (SC-003).
- Transição entre discos < 1s (SC-004).
- Toggle Bomba adiciona 💣 ao lado da posição/título em toda a UI (SC-007).

---

## 5. Rota feliz — US3 (montar set)

1. `/sets/novo` → preencher nome, (opcional) data, local, briefing → **Criar**.
2. Redirecionado para `/sets/[id]/montar`.
3. Aplicar filtros (todos AND entre si):
   - BPM range.
   - Camelot key(s).
   - Energia range.
   - Moods (chips, AND entre termos).
   - Contextos.
   - Bomba (ciclar: qualquer → apenas → sem → qualquer).
   - Texto livre.
4. Clicar nos candidatos para adicionar ao set (somem dos candidatos,
   aparecem no painel do set).
5. Reordenar no painel: arrastar, ou focar item e usar `↑`/`↓`.
6. Abrir `/sets/[id]` → ver lista ordenada + bag física (discos únicos
   com `shelfLocation`).
7. Fechar o navegador, reabrir `/sets/[id]/montar` → filtros restaurados
   do estado salvo.

**Sinais de sucesso**:
- Montar 20 faixas em < 10 min (SC-006).
- Bomba aparece em 100% das listagens (SC-007).

---

## 6. Rota feliz — US4 (sync preservando curadoria)

Precisa de token Discogs real:

1. No Discogs, adicionar um disco novo à coleção.
2. No Sulco, clicar "Sincronizar agora" no painel `/status`.
3. Novo disco aparece com `status = unrated`; existentes intactos.
4. No Discogs, remover um disco.
5. Sync de novo → disco aparece **arquivado** com banner persistente.
6. Editar `notes` de um disco e sincronizar novamente → `notes` intactos
   (SC-008).

---

## 7. Testar cron diário localmente

```bash
curl -X POST http://localhost:3000/api/cron/sync-daily \
  -H "authorization: Bearer $CRON_SECRET"
```

Resposta esperada:
```json
{ "ran": 1, "ok": 1, "rate_limited": 0, "erro": 0, "durationMs": 823 }
```

---

## 8. Testar webhook Clerk localmente

Use `ngrok http 3000` e registre o URL no dashboard Clerk. Delete sua conta
de teste via dashboard da Clerk → evento `user.deleted` dispara → cascade
delete no Sulco. Tabela `users` vazia depois.

---

## 9. Rodar testes

```bash
npm test            # Vitest: unit + integração
npm run test:e2e    # Playwright (requer dev server rodando)
```

Testes críticos:
- `tests/integration/sync-preserves-author-fields.test.ts` → cobre SC-008.
- `tests/e2e/onboarding.spec.ts` → cobre US1 rota feliz.
- `tests/e2e/curadoria-keyboard.spec.ts` → cobre FR-013 + SC-003.
- `tests/e2e/montar-set.spec.ts` → cobre US3 rota feliz + SC-006.

---

## 10. Troubleshooting rápido

| Sintoma | Causa provável | Ação |
|---|---|---|
| Redirect infinito para `/onboarding` | Token salvo inválido ou env quebrada | Ver `users.discogsCredentialStatus` — deve ser `valid` |
| Sync nunca roda | `MASTER_ENCRYPTION_KEY` mudou após salvar PAT | Re-salvar PAT (decrypt falha) |
| "Token Discogs expirou" (banner) | FR-045 acionou (HTTP 401) | Regerar PAT no Discogs e atualizar em `/conta` |
| Bag aparece vazia | Set sem faixas | Adicionar pelo menos 1 faixa em `/sets/[id]/montar` |
| Drag-and-drop quebrado em Safari | @dnd-kit sensor | Fallback por teclado (setas) deve funcionar |
