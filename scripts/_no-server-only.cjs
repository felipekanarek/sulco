/**
 * Require-hook utilitário: faz `import 'server-only';` virar no-op
 * quando o código é executado fora do contexto Next.js (ex: scripts
 * tsx via CLI). Usado via `tsx -r scripts/_no-server-only.cjs ...`.
 *
 * Em runtime Next (dev/build/serverless), este arquivo NÃO é
 * carregado — só o runner CLI passa o flag -r.
 */
const Module = require('node:module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'server-only') {
    return require.resolve('./_empty.cjs');
  }
  return origResolve.call(this, request, parent, ...rest);
};
