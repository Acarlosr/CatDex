import { useState } from 'react';
import { apiClient, setApiKey } from '../api/client';
import Button from './ui/Button';

export default function ApiKeyGate({ onUnlock }) {
  const [keyInput, setKeyInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed || checking) return;

    setChecking(true);
    setError(null);
    try {
      await apiClient.get('/api/bots/summary', {
        headers: { 'X-API-Key': trimmed }
      });
      setApiKey(trimmed);
      onUnlock();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        setError('Invalid API key. Check MASTER_API_KEY in data/.env.');
      } else {
        setError('Could not reach the backend. Is it running?');
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
            <div className="w-12 h-12 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center mb-4 shadow-glow-accent">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-[0.25em] uppercase text-white">
              Apex<span className="text-accent">Algo</span>
            </h1>
            <p className="text-[10px] text-faint uppercase tracking-[0.2em] font-num mt-1.5">
              Quantitative Trading Terminal
            </p>
          </div>

          <p className="text-xs text-muted text-center mb-6 leading-relaxed">
            Enter your API key to unlock the dashboard. You can find it as{' '}
            <span className="text-text font-num">MASTER_API_KEY</span> in{' '}
            <span className="text-text font-num">data/.env</span> on the server.
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
                placeholder="Paste MASTER_API_KEY"
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

            <Button type="submit" size="lg" fullWidth loading={checking} disabled={!keyInput.trim()}>
              {checking ? 'Verifying…' : 'Unlock terminal'}
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
