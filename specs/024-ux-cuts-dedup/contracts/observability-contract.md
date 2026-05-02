# Observability Contract — `[DB]` log lines

**Phase**: 1
**Tipo**: contrato de saída/observabilidade (não API HTTP)

## Contexto

Esta feature usa logs Vercel como meio principal de validação. O wrapper instrumentado em [src/db/index.ts](../../src/db/index.ts) emite linhas `console.log` no formato abaixo. Smoke tests do [quickstart.md](../quickstart.md) dependem deste formato.

## Formato de saída

Para cada chamada `client.execute(stmt)`:

```text
[DB] <duration_ms>ms rows=<row_count> affected=<rows_affected> sql="<truncated_sql>"
```

Para `client.batch(stmts, mode)`:

```text
[DB] BATCH <duration_ms>ms count=<num_statements>
```

Em caso de erro:

```text
[DB] <duration_ms>ms ERROR sql="<truncated_sql>" <error_object>
```

## Especificação dos campos

| Campo | Tipo | Descrição |
|---|---|---|
| `duration_ms` | int | tempo total da query (rede + execução + parse) em milissegundos |
| `row_count` | int | número de rows retornadas pelo SELECT (0 para writes) |
| `rows_affected` | int | número de rows afetadas por INSERT/UPDATE/DELETE (0 para reads) |
| `truncated_sql` | string | SQL com whitespace colapsado, máximo 140 caracteres |

## Métricas derivadas (validação Inc 26)

Dado um conjunto de logs `[DB]` capturados durante 1 hard refresh em `/`:

| Métrica | Cálculo | Valor esperado pós-Inc 26 |
|---|---|---|
| Total de queries | `count(linhas [DB])` | ≤6 (vs ~17 hoje) |
| Queries SELECT users duplicadas | `count(sql startswith "select \"id\", \"clerk_user_id\"")` | 1 (vs 4-5 hoje) |
| Queries SELECT user_facets duplicadas | `count(sql startswith "select \"user_id\", \"genres_json\"")` | 1 (vs 4-5 hoje) |
| Queries de SyncBadge | linhas com `last_status_visit_at`, `EXISTS archived/conflict/run` | 0 (vs 4 hoje) |
| Query de ArchivedRecordsBanner | `select count(*) from records where archived` em layout | 0 em rotas não-`/status` (vs 1 em todas hoje) |
| UPDATE killZombie em load | `[DB] update "sync_runs"` | 0 em load comum (vs 1 hoje) |

## Toggle

- Variável de ambiente `DB_DEBUG` controla emissão. Default ligado. `DB_DEBUG=0` desliga sem deploy de código.
- Pós-validação Inc 26: setar `DB_DEBUG=0` no Vercel; manter wrapper no código pra usar em futuras investigações.

## Estabilidade do contrato

- O formato `[DB] ...ms rows=... sql="..."` é considerado estável durante a vida do wrapper.
- Mudanças de formato exigem atualização concomitante do [quickstart.md](../quickstart.md) e da matriz de métricas acima.
- Wrapper completo pode ser removido em futuro Inc se Vercel/Turso oferecerem observabilidade nativa equivalente.
