# Quickstart — Validação manual do 008

Validação visual e funcional pós-deploy. Complementa testes
automatizados.

## Pré-requisitos

- `npm run db:push` aplicado (2 colunas em `tracks`)
- Acervo com pelo menos 1 disco enriquecido pelo 005 (Spoon, Caetano,
  Roberta Flack — todos com previews Deezer disponíveis)

## Caminho golden

### 1. Curadoria — `/disco/[id]`

Abrir https://sulco.vercel.app/disco/1860 (Spoon — Transference):

- [ ] Em cada faixa, 3 botões aparecem inline: **▶ Deezer** · **↗ Spotify** · **↗ YouTube**
- [ ] Clicar **▶** na A1 (Before Destruction):
  - botão troca pra estado loading (⟳ ou similar)
  - em ≤3s, áudio começa a tocar; botão vira **⏸**
- [ ] Clicar **▶** na A2 enquanto A1 toca:
  - A1 pausa (volta pra ▶)
  - A2 entra em loading e depois toca
- [ ] Áudio termina sozinho aos ~30s:
  - botão volta pra ▶ (sem loop, sem auto-advance)
- [ ] Clicar **▶** na A1 de novo (cache hit):
  - toca em <500ms, sem loading prolongado
- [ ] Clicar **↗ Spotify** na qualquer faixa:
  - nova aba abre em `https://open.spotify.com/search/Spoon%20Before%20Destruction` (ou similar)
- [ ] Clicar **↗ YouTube** em qualquer faixa:
  - nova aba abre em `https://www.youtube.com/results?search_query=Spoon%20Before%20Destruction`

### 2. Faixa sem preview Deezer

Abrir um disco brasileiro obscuro (qualquer record do user com
`audio_features_source IS NULL` em todas as faixas — boa chance de
não ter Deezer match):

- [ ] Clicar **▶** numa faixa
- [ ] Após ~3s, botão Deezer fica disabled com tooltip "sem preview"
- [ ] **↗ Spotify** e **↗ YouTube** continuam funcionais
- [ ] Clicar **▶** de novo na mesma faixa: cache marker, sem nova chamada Deezer (validar via Network tab DevTools)
- [ ] Botão pequeno "tentar de novo" aparece ao lado:
  - clique invalida cache, refaz busca Deezer
  - se Deezer ainda não tem: volta pro estado disabled

### 3. Montagem de set — `/sets/[id]/montar`

- [ ] Aplicar filtros (BPM, gênero, etc.)
- [ ] Em cada CandidateRow, mesmos 3 botões aparecem
- [ ] Clicar **▶** numa candidata: toca preview
- [ ] Clicar **+ adicionar à bag** na mesma faixa: track entra na bag, preview NÃO interrompe
- [ ] Clicar **▶** em outra candidata: anterior pausa, nova começa

### 4. Princípio I (regressão)

- [ ] Pré-popular track com `bpm=120, moods=['solar']`
- [ ] Clicar **▶** na faixa (dispara resolveTrackPreview)
- [ ] Conferir no DB: `bpm` continua 120, `moods` continua `['solar']`
- [ ] `previewUrl` e `previewUrlCachedAt` preenchidos
- [ ] **Nenhum campo AUTHOR mudou** (validado por SC-004)

### 5. Race de cliques rápidos

- [ ] Clicar **▶** rapidamente em 5 faixas diferentes em <2s
- [ ] Apenas a última toca; demais ficam idle
- [ ] DevTools Network: 5 chamadas resolveTrackPreview, mas só 1 áudio toca

## Cenários de falha

### Deezer indisponível (simular via /etc/hosts ou DNS sink)

Adicionar em `/etc/hosts`: `127.0.0.1 api.deezer.com`

- [ ] Clicar **▶**: Server Action falha com timeout (~8s)
- [ ] Botão Deezer mostra "indisponível" + "tentar de novo"
- [ ] **↗ Spotify** e **↗ YouTube** continuam funcionais
- [ ] Outras features do Sulco intactas (curadoria, montar, sync, etc.)

### Audio onerror (URL morta artificial)

Manualmente alterar `previewUrl` no DB pra URL inválida
(`https://invalid.local/x.mp3`):

- [ ] Clicar **▶**: `<audio>` falha em ~5s (browser timeout)
- [ ] UI mostra "Preview indisponível" + "tentar de novo"
- [ ] Click "tentar de novo": invalida cache, refaz Deezer search,
      cacheia URL fresca, toca

## Métricas a observar

- **SC-001**: tempo medido entre click e play (DevTools Performance)
  - 1ª vez: ≤3s
  - subsequentes: <500ms
- **SC-003**: amostra manual de 10 discos enriquecidos pelo 005;
  contar quantas faixas tocam preview Deezer; esperado ≥70%
- **SC-002**: link-out abre nova aba em <200ms (visualmente
  instantâneo)

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Botão Deezer fica em loading eterno | Deezer 503 ou Akamai bot mitigation disparou | Aguardar 1h, tentar de novo. Se persistir, link-outs como workaround |
| Cache não persiste entre sessões | DB write falhou ou ownership check rejeitou | Verificar logs Server Action |
| Player não pausa quando clico outro | PreviewPlayerContext não foi montado no layout | Verificar `<PreviewPlayerProvider>` em `app/layout.tsx` |
| Áudio toca mas com latência alta | Conexão pra Deezer CDN lenta | Sem fix imediato; reportar ao DJ |
