'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { testAndSaveAIConfig, removeAIConfig } from '@/lib/actions';
import {
  MODELS_BY_PROVIDER,
  PROVIDER_LABELS,
} from '@/lib/ai/models';
import type { AIConfigStatus, Provider } from '@/lib/ai/types';

const PROVIDERS: Provider[] = ['gemini', 'anthropic', 'openai', 'deepseek', 'qwen'];

type FormStatus =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

/**
 * Form de configuração de IA do DJ (Inc 014/BYOK).
 *
 * - "Testar conexão" é o único caminho de salvar (FR-005).
 * - Trocar provider exige confirmação e apaga key anterior (US2).
 * - Trocar modelo dentro do mesmo provider preserva key.
 * - Botão "Remover configuração" só aparece quando há config ativa (US3).
 */
export function AIConfigForm({ initialStatus }: { initialStatus: AIConfigStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Provider atualmente persistido (referência pra rollback no cancel da troca).
  const currentProvider: Provider | null = initialStatus.configured
    ? initialStatus.provider
    : null;

  // Estados controlados
  const [selectedProvider, setSelectedProvider] = useState<Provider | ''>(
    currentProvider ?? '',
  );
  const [model, setModel] = useState<string>(
    initialStatus.configured ? initialStatus.model : '',
  );
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });

  function handleProviderChange(next: Provider | '') {
    // Mudança de provider quando há config persistida → exige confirmação
    if (
      currentProvider &&
      next &&
      next !== currentProvider
    ) {
      const confirmed = window.confirm(
        `Trocar pra ${PROVIDER_LABELS[next]} apaga sua chave atual de ${PROVIDER_LABELS[currentProvider]}. Continuar?`,
      );
      if (!confirmed) {
        // rollback do dropdown
        return;
      }
      // Remove config existente e atualiza UI
      startTransition(async () => {
        const res = await removeAIConfig();
        if (res.ok) {
          setSelectedProvider(next);
          setModel(MODELS_BY_PROVIDER[next][0]);
          setApiKey('');
          setStatus({ kind: 'idle' });
          router.refresh();
        }
      });
      return;
    }
    // Caminho normal (primeira config, ou trocar antes de salvar)
    setSelectedProvider(next);
    setModel(next ? MODELS_BY_PROVIDER[next][0] : '');
    setStatus({ kind: 'idle' });
  }

  function handleTest() {
    if (!selectedProvider || !model || apiKey.trim().length < 10) return;
    setStatus({ kind: 'testing' });
    startTransition(async () => {
      const res = await testAndSaveAIConfig({
        provider: selectedProvider,
        model,
        apiKey: apiKey.trim(),
      });
      if (res.ok) {
        setStatus({ kind: 'success', message: 'Configuração salva e verificada.' });
        setApiKey(''); // limpa input — config salva, key fica só criptografada no DB
        router.refresh();
      } else {
        setStatus({ kind: 'error', message: res.error });
      }
    });
  }

  function handleRemove() {
    const confirmed = window.confirm(
      'Remover sua configuração de IA? Funcionalidades dependentes ficarão desabilitadas.',
    );
    if (!confirmed) return;
    startTransition(async () => {
      const res = await removeAIConfig();
      if (res.ok) {
        setSelectedProvider('');
        setModel('');
        setApiKey('');
        setStatus({ kind: 'idle' });
        router.refresh();
      }
    });
  }

  const isConfigured = initialStatus.configured;
  const canTest =
    !!selectedProvider && !!model && apiKey.trim().length >= 10 && !pending;

  return (
    <div className="flex flex-col gap-4 max-w-[560px]">
      {isConfigured ? (
        <p
          role="status"
          className="font-serif italic text-[14px] md:text-[15px] text-ok"
        >
          ✓ Configurada com {PROVIDER_LABELS[initialStatus.provider]} ·{' '}
          <span className="font-mono not-italic text-[13px]">{initialStatus.model}</span>
        </p>
      ) : (
        <p className="font-serif italic text-[14px] md:text-[15px] text-ink-mute">
          Sem configuração ativa.
        </p>
      )}

      {/* Provider */}
      <label className="flex flex-col gap-1">
        <span className="label-tech text-ink-mute">Provider</span>
        <select
          value={selectedProvider}
          onChange={(e) => handleProviderChange(e.target.value as Provider | '')}
          disabled={pending}
          className="font-mono text-[14px] border border-line bg-paper px-3 py-2 min-h-[44px] disabled:opacity-50"
        >
          <option value="">— escolher provider —</option>
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>
      </label>

      {/* Modelo */}
      {selectedProvider ? (
        <label className="flex flex-col gap-1">
          <span className="label-tech text-ink-mute">Modelo</span>
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setStatus({ kind: 'idle' });
            }}
            disabled={pending}
            className="font-mono text-[14px] border border-line bg-paper px-3 py-2 min-h-[44px] disabled:opacity-50"
          >
            {MODELS_BY_PROVIDER[selectedProvider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {/* API key */}
      {selectedProvider ? (
        <label className="flex flex-col gap-1">
          <span className="label-tech text-ink-mute">Chave de API</span>
          <div className="flex gap-2 items-stretch">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setStatus({ kind: 'idle' });
              }}
              placeholder={
                isConfigured && selectedProvider === currentProvider
                  ? '••• cole nova chave pra atualizar •••'
                  : `Cole sua chave de ${PROVIDER_LABELS[selectedProvider]}`
              }
              disabled={pending}
              className="flex-1 font-mono text-[13px] border border-line bg-paper px-3 py-2 min-h-[44px] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              disabled={pending}
              aria-label={showKey ? 'Ocultar chave' : 'Revelar chave'}
              className="font-mono text-[12px] border border-line hover:border-ink px-3 min-h-[44px] min-w-[44px] disabled:opacity-50"
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
        </label>
      ) : null}

      {/* Feedback */}
      {status.kind === 'success' ? (
        <p role="status" className="font-serif italic text-[14px] text-ok">
          ✓ {status.message}
        </p>
      ) : null}
      {status.kind === 'error' ? (
        <p role="alert" className="font-serif italic text-[14px] text-warn">
          {status.message}
        </p>
      ) : null}

      {/* Ações */}
      <div className="flex flex-wrap gap-3 mt-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={!canTest}
          className="font-mono text-[12px] uppercase tracking-[0.12em] border border-ink bg-ink text-paper hover:bg-paper hover:text-ink px-4 py-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status.kind === 'testing' || pending ? 'Testando…' : 'Testar conexão'}
        </button>
        {isConfigured ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="font-mono text-[12px] uppercase tracking-[0.12em] border border-line hover:border-warn hover:text-warn px-4 py-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Remover configuração
          </button>
        ) : null}
      </div>
    </div>
  );
}
