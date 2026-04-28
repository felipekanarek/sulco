# Quickstart — Validar Inc 14 manualmente

Pré-requisitos:
- `npm run dev` em `localhost:3000`
- Conta logada
- Pelo menos 1 chave de API válida pra um dos 5 providers

## Cenário 1 — Configuração inicial (P1, US1)

1. `sqlite3 sulco.db "UPDATE users SET ai_provider=NULL, ai_model=NULL, ai_api_key_encrypted=NULL WHERE id=<ID>;"`
2. Abrir `/conta`. Procurar seção "Inteligência Artificial".
3. **Esperado**: dropdown de provider, mensagem "Sem configuração ativa", inputs de key/modelo ocultos ou desabilitados.
4. Selecionar Gemini no dropdown. Dropdown de modelo aparece com `gemini-2.5-flash`/`gemini-2.5-pro`. Input de key aparece (mascarado).
5. Colar uma key Gemini válida em mãos.
6. Clicar **"Testar conexão"**. Spinner aparece. Em ≤5s, ver "✓ Configuração salva e verificada".
7. Confirmar via DB:
   ```sql
   SELECT ai_provider, ai_model, ai_api_key_encrypted FROM users WHERE id=<ID>;
   ```
   - `ai_provider = 'gemini'`
   - `ai_model = 'gemini-2.5-flash'`
   - `ai_api_key_encrypted` começa com `v1:` (criptografado, NÃO contém a key em texto puro).

## Cenário 2 — Key inválida (P1, US1 acceptance 3)

1. Continuar de cenário 1 (config salva). Recarregar `/conta`.
2. Trocar a key (input em modo edit) por uma string aleatória.
3. Clicar **"Testar conexão"**.
4. **Esperado**: ≤10s, mensagem contextual "Chave inválida ou revogada — reconfigure". Config existente permanece **inalterada** no DB (verificar via SQL: ainda tem a key antiga criptografada).

## Cenário 3 — Trocar de provider (P1, US2)

1. Com Gemini ativo, mudar dropdown pra Anthropic.
2. **Esperado**: diálogo de confirmação "Trocar de provider apaga a chave Gemini. Continuar?".
3. Clicar **Cancelar**. Config Gemini intacta no DB.
4. Repetir, agora clicar **Confirmar**. Tela mostra estado pré-config Anthropic (key vazia, modelo default Claude Haiku).
5. Colar key Anthropic, testar, ver "✓ Configuração salva e verificada".
6. SQL: `ai_provider='anthropic'`, `ai_model` válido, `ai_api_key_encrypted` é a nova chave (não tem mais a Gemini).

## Cenário 4 — Trocar modelo dentro do mesmo provider

1. Com Anthropic ativo, mudar dropdown de modelo de Haiku → Sonnet **sem trocar a key**.
2. Clicar **"Testar conexão"** (botão fica habilitado apenas quando algo muda).
3. **Esperado**: ping com Sonnet, ok → config atualizada (`ai_model='claude-sonnet-4-6'`). Sem confirmação porque não trocou provider.

## Cenário 5 — Remover configuração (P2, US3)

1. Com config ativa, clicar **"Remover configuração"**.
2. **Esperado**: confirmação "Remover sua configuração de IA? Funcionalidades dependentes ficarão desabilitadas."
3. Confirmar. Página recarrega. Tela volta ao estado inicial (cenário 1, sem config).
4. SQL: `ai_provider`, `ai_model`, `ai_api_key_encrypted` todos `NULL`.

## Cenário 6 — Multi-user isolation (SC-006)

1. Login user A. Config ativa com Gemini.
2. Logout. Login user B (conta diferente, sem config).
3. **Esperado**: `/conta` de B mostra estado inicial. SQL confirma: `users.ai_provider` de A intocado, de B null.
4. B configura Anthropic. SQL: A continua Gemini, B Anthropic. Sem cross-contamination.

## Cenário 7 — Validação dos 5 providers (smoke pesado)

Repetir cenário 1 com cada provider, usando key válida:
- Gemini: `gemini-2.5-flash`
- Anthropic: `claude-haiku-4-5`
- OpenAI: `gpt-4o-mini`
- DeepSeek: `deepseek-chat`
- Qwen: `qwen-turbo`

Cada um deve passar no ping em ≤5s e persistir no DB.

## Cenário 8 — Timeout (Q3)

1. Forçar timeout: bloquear DNS/rede pra `api.openai.com` (ex: editar `/etc/hosts` adicionando `127.0.0.1 api.openai.com`) ou desconectar wifi.
2. Selecionar OpenAI, colar key qualquer, clicar Testar.
3. **Esperado**: em 10s exatos, mensagem "Provider não respondeu — tente novamente". Sem alteração no DB.
4. Restaurar conectividade.

## Smoke checks finais

- `npm run build` passa sem erros novos.
- DevTools Network: chamada do ping vai pro provider correto (verificar URL).
- DevTools Application > Cookies/Storage: NENHUM lugar do client tem a chave em texto puro.
- Logs do servidor durante ping: chave NÃO aparece em `console.log`/`console.error`.
- Render do `/conta` em RSC: ver via "View Source" que com config ativa, o HTML tem "✓ Configurada", e SEM config tem "Sem configuração ativa". (Confirma decisão Q4 — server-render decide.)
