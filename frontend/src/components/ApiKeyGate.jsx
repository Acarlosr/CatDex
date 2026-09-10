import { useState } from 'react';
import { login, API_BASE_URL } from '../api/client';
import Button from './ui/Button';
import { useLanguage } from '../i18n.jsx';

export default function ApiKeyGate({ onUnlock, signedOutReason = null }) {
  const [keyInput, setKeyInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [networkError, setNetworkError] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed || checking) return;

    setChecking(true);
    setError(null);
    setNetworkError(false);
    try {
      await login(trimmed);
      onUnlock();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        setError(t('login.error'));
      } else if (!err.response) {
        // Network level: backend still starting, down, or the browser refused
        // the (self-signed) certificate of a cross-origin API.
        setNetworkError(true);
      } else {
        setError('The backend responded with an unexpected error. Try again in a moment.');
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="relative flex h-[100dvh] items-center justify-center bg-bg text-text font-sans p-4 overflow-hidden grid-background">
      {/* Ambient glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[560px] h-[560px] bg-accent/[0.05] rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[360px] h-[360px] bg-info/[0.04] rounded-full blur-[110px] pointer-events-none" />

      <div className="relative w-full max-w-md fade-in">
        <div className="bg-raised/80 backdrop-blur-xl border border-border rounded-xl shadow-pop p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

          {/* Logo */}
          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center mb-4 shadow-glow-accent">
              <img src="/catdex-logo.svg" alt="CatDex" className="w-12 h-12" />
            </div>
            <h1 className="text-xl font-bold tracking-[0.25em] uppercase text-text">
              Cat<span className="text-accent">Dex</span>
            </h1>
            <p className="text-[10px] text-faint uppercase tracking-[0.2em] font-num mt-1.5">
              {t('login.subtitle')}
            </p>
          </div>

          {signedOutReason && (
            <div className="flex items-start gap-2.5 p-3 mb-5 bg-info/10 border border-info/40 text-info text-xs rounded-md fade-in">
              <svg className="w-4 h-4 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="leading-relaxed">
                {t('login.signedOut')} <span className="font-num">data/.env</span>.
              </span>
            </div>
          )}

<p className="text-xs text-muted text-center mb-6 leading-relaxed">
              {t('login.instructions')}{' '}
              <span className="text-text font-num">c••••x</span> {t('login.location').replace('no servidor', 'in')}{' '}
              <span className="text-text font-num">data/.env</span> {t('login.location').includes('servidor') ? '' : t('login.location').replace('in ', '')}.
            </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <svg className="w-4 h-4 text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => { setKeyInput(e.target.value); if (error) setError(null); }}
                placeholder={t('login.placeholder')}
                autoFocus
                autoComplete="off"
                className={`w-full bg-inset border rounded-md pl-10 pr-4 py-3 text-sm text-text placeholder-faint font-num outline-none transition-colors duration-200 ${
                  error ? 'border-danger/60 focus:border-danger' : 'border-border hover:border-border-strong focus:border-accent/70'
                }`}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 bg-danger/10 border border-danger/40 text-danger text-xs rounded-md fade-in">
                <svg className="w-4 h-4 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M12 3l9 16H3l9-16z" />
                </svg>
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {networkError && (
              <div className="flex items-start gap-2.5 p-3 bg-warn/10 border border-warn/40 text-warn text-xs rounded-md fade-in">
                <svg className="w-4 h-4 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M12 3l9 16H3l9-16z" />
                </svg>
                <div className="leading-relaxed space-y-2">
                  <p className="font-semibold">Could not reach the backend.</p>
                  <p className="text-warn/90">
                    On a first start the backend can take up to ~2 minutes to
                    initialize (database, certificates). Wait a moment and try again.
                  </p>
                  {API_BASE_URL !== '' && (
                    <p className="text-warn/90">
                      If this keeps happening, your browser may be blocking the
                      backend&apos;s self-signed certificate. Open{' '}
                      <a
                        href={`${API_BASE_URL}/health`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-num text-warn hover:text-accent transition-colors"
                      >
                        {API_BASE_URL}/health
                      </a>{' '}
                      in a new tab, accept the certificate warning until you see{' '}
                      <span className="font-num">{'{"status":"ok"}'}</span>, then
                      come back here and press &quot;Try again&quot;.
                    </p>
                  )}
                </div>
              </div>
            )}

            <Button type="submit" size="lg" fullWidth loading={checking} disabled={!keyInput.trim()}>
              {checking ? t('common.loading') : networkError ? 'Try again' : t('login.button')}
            </Button>
          </form>
        </div>

        <p className="text-center text-[10px] text-faint mt-5 font-num tracking-wider">
          Self-hosted · Your keys never leave this server
        </p>
      </div>
    </div>
  );
}
