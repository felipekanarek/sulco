# Quickstart walkthrough — Sulco Piloto

Roteiro de validação ponta-a-ponta executado em máquina limpa. Cada passo
aqui deve levar ao fluxo descrito; discrepâncias indicam regressão.

**Pré-requisitos**: seguir `README.md` para setup. Este doc supõe:
- `.env.local` com chaves Clerk válidas + secrets gerados
- `npm run db:reset` executado (banco com seed fresco)
- `npm run dev` rodando em :3000

## 1. Signup + onboarding (US1)

1. Acessar http://localhost:3000
2. Redirect para `/sign-in` (middleware)
3. Clicar em "Sign up", cadastrar email + senha
4. Pós-signup → `/` redireciona para `/onboarding`
5. Preencher `discogsUsername` + PAT
6. Salvar → validação chama API Discogs uma vez
7. Se OK → `/` com import inicial em background
8. Se username inexistente / PAT inválido / coleção vazia → mensagens específicas FR-051

## 2. Listagem + filtros (US1)

- `/` mostra **lista** (default) ou **grade** (toggle)
- Header: stats Discos / Ativos / Não avaliados / Faixas selecionadas
- Filter bar: pills status, busca texto, Bomba tri-estado, gêneros OU, estilos OU
- Chips "+N mais" expandem facetas; selecionados ficam sempre visíveis
- Link "Curadoria →" em cada linha/card vai direto pra `/disco/[id]`

## 3. Curadoria sequencial (US2)

- Nav bar → "Curadoria" → `/curadoria`
- Teclado: `A` (Ativo) / `D` (Descartado) / `→` (skip) / `←` (voltar)
- Último disco → `/curadoria/concluido`

## 4. Curadoria de faixas (US2)

- `/disco/[id]` com sidebar de status/prateleira/notas + tracklist
- Toggle `on/off` em cada faixa
- Rating `+/++/+++`, BPM, CamelotWheel, energia, ChipPicker moods/contexts, Bomba
- Fim da sidebar: "Reimportar este disco" + link Discogs + voltar triagem

## 5. Criar e montar set (US3)

1. Nav bar → "Sets" → `/sets`
2. "+ Novo set" → preencher nome + data + local + briefing
3. Redireciona para `/sets/[id]/montar`
4. Filter bar: BPM range, Camelot multi, energy range, rating range,
   moods AND, contexts AND, Bomba tri-estado, texto
5. Adicionar candidatos via botão `+` (bag física atualiza instantaneamente)
6. Remover via `×` na sidebar direita
7. Arrastar ⋮⋮ ou Tab+Espaço+setas para reordenar
8. "Finalizar →" → `/sets/[id]` com setlist numerada + bag física derivada
9. Status derivado do eventDate: Rascunho (vazio) / Agendado (futuro) / Realizado (passado)

## 6. Sync + conflitos (US4)

1. `/status` mostra últimas 20 execuções
2. Clicar "Sincronizar agora" → `runManualSync`
3. Forçar disco arquivado: banner warn no topo; `/status` oferece "Reconhecer"
4. Forçar faixa em conflito: `/status` oferece "Manter no Sulco" / "Descartar"
5. Badge "alertas" no header some ao visitar `/status`

## 7. Reimport individual (US4)

1. `/disco/[id]` → "Reimportar este disco"
2. Após sucesso: cooldown 60s local, texto "Aguarde ~60s"
3. Sigilo de Princípio I: editar `notes`, rodar reimport, `notes` inalterada

## 8. Deletar conta (Polish)

1. Nav bar → "Conta" → `/conta`
2. Rolar até "Zona perigosa" → "Apagar conta"
3. Modal exige digitar `APAGAR`
4. Confirmar → cascade delete + clerkClient.users.deleteUser
5. Redirect para `/` → middleware manda pra `/sign-in`

## 9. Playlists 404

- `/playlists` → HTTP 404 (FR-053a, middleware rewrite)

## 10. A11y manual

- Ver `docs/a11y-audit.md` para checklist completo
- Meta: Lighthouse a11y ≥ 95 em telas críticas

## Captura do walkthrough

Registrar screenshots em `docs/walkthrough-screens/` quando rodar auditoria
oficial pré-ship.
