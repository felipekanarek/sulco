'use client';

import { useEffect } from 'react';
import { getImportProgress } from '@/lib/actions';

/**
 * Poller silencioso global (002-multi-conta follow-up).
 *
 * Chama `getImportProgress` a cada 10s de qualquer rota Sulco aberta.
 * Essa função tem a lógica de retomada embutida (mata zumbis, detecta
 * run parado e dispara `after(runInitialImport)`).
 *
 * Sem UI — apenas mantém o import progredindo quando o usuário está
 * em outra tela que não `/`. O `ImportProgressCard` na home continua
 * sendo o lugar onde o progresso é visível.
 *
 * Intervalo 10s (não 3s como o card) porque:
 * - Threshold zombie é 65s; 10s é pequeno o suficiente pra pegar assim
 *   que um worker morre.
 * - Menos hammer na API em rotas que não precisam ver progresso.
 */
export function ImportPoller() {
  useEffect(() => {
    // Primeira chamada imediata, depois intervalo.
    const fire = async () => {
      try {
        await getImportProgress();
      } catch {
        // Silenciosamente ignora — usuário pode estar sem sessão,
        // onboarding pendente, etc. A próxima chamada tenta de novo.
      }
    };
    fire();
    const id = setInterval(fire, 10_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
