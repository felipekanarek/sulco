# Contract: /convite-fechado page

## Rota

`GET /convite-fechado` — Server Component, estática (sem query ao DB,
sem `requireCurrentUser`).

## Autorização

**Rota pública**. DEVE estar no allowlist do middleware junto com
`/sign-in`, `/sign-up`, `/api/webhooks/clerk`.

## Disparador

- Navegação direta: alguém compartilha o link.
- Redirect programático: `router.replace('/convite-fechado')` do
  handler `onError` no `<SignUp>` quando detecta código
  `form_identifier_not_allowed` / `not_allowed_to_sign_up`.

## Conteúdo

Em pt-BR, identidade editorial do Sulco:

```tsx
<main className="max-w-[640px] mx-auto px-8 pt-24 text-center">
  <p className="eyebrow text-accent mb-4">Acesso por convite</p>
  <h1 className="font-serif italic text-4xl leading-tight mb-6">
    O Sulco está em fase de convite
  </h1>
  <p className="font-serif text-[18px] text-ink-soft leading-relaxed mb-6">
    Estamos testando o piloto com um grupo pequeno de DJs. Se você
    quiser participar, escreva pra gente.
  </p>
  <a
    href={`mailto:${ownerEmail}?subject=Pedido de acesso ao Sulco`}
    className="font-mono text-[11px] uppercase tracking-[0.12em]
               border border-ink text-ink hover:bg-ink hover:text-paper
               px-5 py-2 rounded-sm transition-colors"
  >
    Solicitar acesso
  </a>
</main>
```

**Contract**:

- `ownerEmail` vem de `process.env.OWNER_EMAIL` (já configurado para
  FR-012). Nenhum dado sensível adicional é exposto.
- Página totalmente estática no que toca a conteúdo. Qualquer métrica
  (hits) fica com a Vercel automaticamente.

## Acessibilidade

- `<h1>` único, título claro.
- Link `mailto` funciona sem JS.
- Contraste AA mantido (tokens --ink, --ink-soft, --accent do piloto).

## Não faz

- Não oferece formulário de waitlist.
- Não coleta emails.
- Não faz fetch/API.
- Não se comunica com o backend do Sulco.
