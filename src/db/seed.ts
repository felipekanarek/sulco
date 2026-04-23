/**
 * Seed de dev. O seed antigo (single-user, sem `userId`) foi arquivado em
 * `../sulco-legacy-backup/seed.ts.old` durante a Phase 2 de schema alignment.
 *
 * Reescrita completa (30 discos associados a um user de dev + primeiro disco
 * com faixas selected + smoke values) fica em T113 (Phase 7).
 */

async function main() {
  console.log(
    'Seed atual é no-op. Esperando T113 para reescrever com user fixture + 30 discos.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
