# Quickstart — Faixas ricas em "Montar set" (003)

Roteiro de validação ponta-a-ponta. Cada passo deve funcionar sem
regressão das features existentes.

**Pré-requisitos**:

- Deploy do 003 no ar em https://sulco.vercel.app
- Pelo menos 10 faixas com curadoria completa no DB:
  - rating em variação (1, 2, 3, null)
  - pelo menos 2 tracks com 6+ moods E 6+ contexts (pra testar
    overflow `+N mais`)
  - 3 tracks com `comment` e 1 com `references`
  - 2 records com `notes` preenchido e `shelfLocation` definido
  - 2 tracks com `isBomb=true`
- Um set em `/sets/<id>/montar` com pelo menos 20 candidatos
  filtráveis

## 1. Modo compacto — candidato com curadoria completa

1. Acessar `/sets/<id>/montar`
2. Aplicar filtro que traga ≥20 candidatos
3. Localizar uma faixa com rating=3, isBomb=true, comment e
   fineGenre preenchidos
4. Verificar que o card mostra:
   - Capa, posição, artista/título (como antes)
   - `+++` em vermelho bold ao lado do rating
   - BombaBadge inline ao lado do título
   - fineGenre em texto pequeno
   - Chips de moods (variant colorida) e contexts (variant sóbria)
   - Comment truncado em itálico com tooltip full on hover
5. BPM/tom/energia continuam aparecendo na coluna direita

## 2. Chip overflow `+N mais`

1. Localizar candidato com 6+ moods e 6+ contexts
2. Confirmar que modo compacto mostra:
   - 4 chips de moods + `+2 mais` (se 6 total)
   - 4 chips de contexts + `+2 mais`
3. Clicar no chevron `▸`
4. Modo expandido mostra TODOS os chips em wrap livre

## 3. Toggle expand/collapse

1. Card compacto: chevron `▸` à direita
2. Clicar → card expande inline, chevron vira `▾`
3. Conteúdo adicional visível:
   - references (se preenchido)
   - shelfLocation com ícone 📍
   - notes do disco com line breaks preservadas
   - comment full
   - todos os chips sem truncate
4. Clicar `▾` → colapsa de volta
5. Scroll não muda (mesma posição antes/depois)

## 4. Estado independente por candidato

1. Expandir candidato A (`▸` → `▾`)
2. Expandir candidato B
3. Colapsar candidato A (candidato B permanece expandido)
4. Aplicar filtro que diminui lista → candidato C aparece em modo
   compacto default
5. Estados de A e B persistem enquanto eles aparecerem

## 5. Reload limpa estado de expansão

1. Com ≥3 candidatos expandidos, recarregar a página (F5)
2. Todos voltam ao modo compacto
3. Confirma que NÃO há estado persistido em localStorage
   (DevTools → Application → Storage → Local Storage → nada)

## 6. Campo vazio omitido

1. Localizar candidato sem comment, sem references, sem fineGenre
2. Modo compacto: SEM linha de comment, SEM label fineGenre (não
   aparece "—" nem espaço vazio)
3. Modo expandido: mesmo — só o que está preenchido aparece

## 7. Adicionar à bag preserva expand

1. Expandir candidato X
2. Clicar botão `+` (adiciona à bag)
3. Card permanece na lista, agora com:
   - Borda esquerda verde (ok)
   - Fundo sutil verde claro
   - Botão `+` vira `✓` + botão "remover"
4. **Estado expandido é mantido** — continua mostrando detalhes

## 8. Remover da bag inline

1. Card marcado como na bag (`✓`)
2. Clicar botão "remover"
3. Card volta ao estado normal, botão `+` reaparece
4. SetSidePanel (lado direito) reflete remoção imediatamente
5. Estado expand/collapse do card NÃO muda

## 9. Teclado e acessibilidade

1. Tab pelo card → foco chega no botão chevron
2. Enter/Space → alterna estado
3. Screen reader (se disponível): narra "Expandir detalhes" /
   "Recolher detalhes"
4. `aria-expanded` reflete estado corretamente no DOM

## 10. Performance — coleção grande

1. Filtrar uma lista de 200+ candidatos
2. Medir tempo de render inicial (DevTools → Performance)
3. Comparar com baseline pré-003 — diferença ≤10% (SC-005)
4. Expandir 5 candidatos em sequência — cada toggle < 100ms (SC-003)

## 11. Regressão Princípio I

1. Antes: snapshot dos campos autorais de 5 tracks no DB
2. Usar a tela de montar set por 10 min (expandir, adicionar, remover,
   filtrar)
3. Depois: snapshot dos mesmos campos
4. Diff deve ser ZERO (zero writes em campos autorais por efeito da
   tela)
