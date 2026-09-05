import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { humanizeApiError } from '../api/errors';
import PageShell from './ui/PageShell';
import GlowPanel from './ui/GlowPanel';
import SectionHeader from './ui/SectionHeader';
import Button from './ui/Button';
import Badge from './ui/Badge';
import EmptyState from './ui/EmptyState';
import { Input, Select } from './ui/Input';
import { SkeletonCard } from './ui/Skeleton';
import { toast } from './ui/Toast';
import { confirmDialog } from './ui/ConfirmDialog';

const EXCHANGES = [
  { id: 'okx', name: 'OKX' },
  { id: 'binance', name: 'Binance' },
  { id: 'bitvavo', name: 'Bitvavo' },
  { id: 'coinbase', name: 'Coinbase' },
  { id: 'cryptocom', name: 'Crypto.com' },
  { id: 'kraken', name: 'Kraken' },
  { id: 'kucoin', name: 'KuCoin' },
];

const EXCHANGE_NAMES = Object.fromEntries(EXCHANGES.map(ex => [ex.id, ex.name]));

/* Deterministic avatar color per exchange (token values) */
const AVATAR_COLORS = {
  okx: 'text-info border-info/30 bg-info/10',
  binance: 'text-accent border-accent/30 bg-accent/10',
  bitvavo: 'text-success border-success/30 bg-success/10',
  coinbase: 'text-info border-info/30 bg-info/10',
  cryptocom: 'text-purple border-purple/30 bg-purple/10',
  kraken: 'text-purple border-purple/30 bg-purple/10',
  kucoin: 'text-success border-success/30 bg-success/10',
};

const IconKeyEmpty = (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a4 4 0 11-4 4c0-.35.04-.7.13-1.03L4 17v3h3l1-1v-2h2v-2h2l1.87-1.87c.33.09.68.13 1.13.13a4 4 0 000-8z" />
    <circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" />
  </svg>
);

function ExchangeAvatar({ exchange }) {
  const initial = (EXCHANGE_NAMES[exchange] || exchange || '?').charAt(0).toUpperCase();
  return (
    <div
      className={`w-9 h-9 rounded-lg border flex items-center justify-center font-bold text-sm shrink-0 ${AVATAR_COLORS[exchange] || 'text-muted border-border bg-raised'}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

export default function Settings() {
  const [keys, setKeys] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingKey, setDeletingKey] = useState(null);

  const [balances, setBalances] = useState({});
  const [fetchingBalanceFor, setFetchingBalanceFor] = useState(null);

  const [keyName, setKeyName] = useState('');
  const [selectedExchange, setSelectedExchange] = useState('okx');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [isSandbox, setIsSandbox] = useState(true);

  const needsPassphrase = ['okx', 'kucoin'].includes(selectedExchange);

  const [swapModal, setSwapModal] = useState(null);
  const [swapFrom, setSwapFrom] = useState('USDC');
  const [swapTo, setSwapTo] = useState('BTC');
  const [swapAmount, setSwapAmount] = useState('');
  const [amountType, setAmountType] = useState('from');

  const fetchKeys = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await apiClient.get('/api/keys');
      setKeys(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      toast.error(humanizeApiError(err));
    }
    setRefreshing(false);
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchKeys(); // eslint-disable-line react-hooks/set-state-in-effect -- initial data fetch on mount
    return () => controller.abort();
  }, [fetchKeys]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post('/api/keys', {
        name: keyName,
        exchange: selectedExchange,
        api_key: apiKey,
        api_secret: apiSecret,
        passphrase: needsPassphrase ? passphrase : '',
        is_sandbox: isSandbox
      });
      toast.success(`Key '${keyName}' verified and securely stored.`);
      setKeyName('');
      setApiKey('');
      setApiSecret('');
      setPassphrase('');
      fetchKeys();
    } catch (err) {
      toast.error(humanizeApiError(err, 'An unexpected error occurred.'));
    }
    setLoading(false);
  };

  const handleDeleteClick = async (delName) => {
    const ok = await confirmDialog({
      title: 'Delete Connection',
      message: `Are you sure you want to permanently delete the key '${delName}'?`,
      confirmText: 'Delete Key',
      type: 'danger',
    });
    if (!ok) return;
    setDeletingKey(delName);
    try {
      await apiClient.delete(`/api/keys/${delName}`);
      setBalances(prev => {
        const newBal = {...prev};
        delete newBal[delName];
        return newBal;
      });
      fetchKeys();
      toast.success(`Key '${delName}' deleted`);
    } catch (err) {
      toast.error(humanizeApiError(err));
    }
    setDeletingKey(null);
  };

  const handleFetchBalance = async (kName) => {
    if (balances[kName]) {
      setBalances(prev => {
        const newBal = {...prev};
        delete newBal[kName];
        return newBal;
      });
      return;
    }

    setFetchingBalanceFor(kName);
    try {
      const response = await apiClient.get(`/api/keys/${kName}/balance`);
      setBalances(prev => ({
        ...prev,
        [kName]: response.data.balances
      }));
    } catch (err) {
      toast.error(humanizeApiError(err, `Failed to fetch balance for ${kName}`));
    }
    setFetchingBalanceFor(null);
  };

  const openSwapModal = async (kName) => {
      setSwapModal(kName);
      if (!balances[kName]) {
          try {
              const response = await apiClient.get(`/api/keys/${kName}/balance`);
              setBalances(prev => ({ ...prev, [kName]: response.data.balances }));
          } catch { /* silent */ }
      }
  };

  const handleMaxClick = () => {
      const walletBalances = balances[swapModal];
      if (!walletBalances || !walletBalances[swapFrom]) {
          toast.warn(`You don't have any ${swapFrom} in this wallet.`);
          return;
      }
      setAmountType('from');
      setSwapAmount(walletBalances[swapFrom].free);
  };

  const executeSwap = async (e) => {
      e.preventDefault();
      setLoading(true);
      const currentWallet = swapModal;
      try {
          await apiClient.post(`/api/keys/${currentWallet}/swap`, {
              from_asset: swapFrom,
              to_asset: swapTo,
              amount: parseFloat(swapAmount),
              amount_type: amountType
          });

          setSwapModal(null);
          toast.success('Market order executed. Updating balance…');

          setTimeout(async () => {
              try {
                  const response = await apiClient.get(`/api/keys/${currentWallet}/balance`);
                  setBalances(prev => ({ ...prev, [currentWallet]: response.data.balances }));
              } catch { /* silent */ }
          }, 1500);

      } catch (err) {
          setSwapModal(null);
          toast.error(humanizeApiError(err));
      }
      setLoading(false);
  };

  return (
    <PageShell glowColor="gold">
      {/* Swap modal */}
      {swapModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSwapModal(null)} />
          <div className="relative modal-enter terminal-card max-w-md w-full shadow-pop">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text">Market Execution</h3>
                    <p className="text-muted text-[10px] mt-0.5">Routing via: <span className="text-accent font-bold">{swapModal}</span></p>
                </div>
                <button
                  onClick={() => setSwapModal(null)}
                  title="Close"
                  aria-label="Close"
                  className="text-muted hover:text-danger transition-colors font-bold"
                >
                  &#10005;
                </button>
            </div>

            <form onSubmit={executeSwap} className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="From Asset (Sell)"
                      mono
                      required
                      value={swapFrom}
                      onChange={e => setSwapFrom(e.target.value.toUpperCase())}
                      placeholder="USDC"
                    />
                    <Input
                      label="To Asset (Buy)"
                      mono
                      required
                      value={swapTo}
                      onChange={e => setSwapTo(e.target.value.toUpperCase())}
                      placeholder="SOL"
                    />
                </div>

                <div>
                    <div className="flex justify-between items-end mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Trade Size</span>
                        {balances[swapModal] && balances[swapModal][swapFrom] && (
                            <span className="text-[9px] text-muted font-num">Avail: {balances[swapModal][swapFrom].free.toFixed(4)} {swapFrom}</span>
                        )}
                    </div>
                    <div className="flex bg-inset border border-border rounded-md overflow-hidden focus-within:border-accent/70 transition-colors duration-200">
                        <select
                          value={amountType}
                          onChange={e => setAmountType(e.target.value)}
                          className="bg-raised text-muted text-[10px] uppercase font-bold px-2.5 py-2 border-r border-border outline-none cursor-pointer hover:text-text"
                        >
                            <option value="from">Spend ({swapFrom})</option>
                            <option value="to">Receive ({swapTo})</option>
                        </select>
                        <input
                          type="number"
                          step="any"
                          required
                          value={swapAmount}
                          onChange={e => setSwapAmount(e.target.value)}
                          className="w-full bg-transparent text-text font-num px-3 py-2 text-xs focus:outline-none placeholder-faint"
                          placeholder="0.00"
                        />
                        <button
                          type="button"
                          onClick={handleMaxClick}
                          title="Use full available balance"
                          className="bg-overlay hover:bg-border text-text text-[9px] font-bold uppercase px-3 transition-colors border-l border-border"
                        >
                          MAX
                        </button>
                    </div>
                </div>

                <div className="pt-4 border-t border-border">
                    <Button type="submit" fullWidth loading={loading}>
                        Execute Order
                    </Button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* Exchange Connections */}
      <GlowPanel glowColor="gold">
        <SectionHeader
          title="Exchange Connections"
          subtitle="Encrypted API keys stored locally"
          accentColor="white"
          action={
            <Button variant="secondary" size="sm" loading={refreshing} onClick={fetchKeys}>
              Refresh Status
            </Button>
          }
        />

        <div className="mt-5">
        {initialLoading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : keys.length === 0 ? (
          <div className="border border-border border-dashed rounded-lg bg-inset/40">
            <EmptyState
              icon={IconKeyEmpty}
              title="No exchange keys configured"
              description="Add an API key below to enable live trading, balance checks, and market execution."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((k, index) => (
              <div key={index} className={`flex flex-col bg-inset/50 p-4 border border-border rounded-lg transition-all duration-200 hover:border-border-strong fade-in-delay-${Math.min(index + 1, 6)}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <ExchangeAvatar exchange={k.exchange} />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-text font-bold text-sm truncate">{k.name}</span>
                        {k.is_active
                          ? <Badge variant="success" dot>Connected</Badge>
                          : <Badge variant="danger" dot pulse>
                              <span title={k.error_msg} className="cursor-help">Error</span>
                            </Badge>}
                        <Badge variant={k.is_sandbox ? 'info' : 'accent'}>
                          {k.is_sandbox ? 'Sandbox' : 'Live'}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted uppercase font-bold tracking-wider mt-1">
                        {EXCHANGE_NAMES[k.exchange] || k.exchange}
                        <span className="text-faint normal-case font-num tracking-normal ml-2">••••••••••••••••</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 items-center shrink-0">
                    {k.is_active && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          title="Execute a market swap through this key"
                          onClick={() => openSwapModal(k.name)}
                        >
                          Trade
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={fetchingBalanceFor === k.name}
                          title={balances[k.name] ? 'Hide wallet balances' : 'Fetch wallet balances'}
                          onClick={() => handleFetchBalance(k.name)}
                        >
                          {balances[k.name] ? 'Hide Assets' : 'Assets'}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deletingKey === k.name}
                      title="Delete this connection"
                      onClick={() => handleDeleteClick(k.name)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {balances[k.name] && (
                  <div className="mt-4 pt-4 border-t border-border/50 fade-in">
                    {Object.keys(balances[k.name]).length === 0 ? (
                      <span className="text-xs text-muted">Wallet is empty.</span>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(balances[k.name]).map(([coin, data]) => (
                          <div key={coin} className="terminal-card p-3 border-l-2 border-success">
                            <span className="text-[10px] text-muted font-bold uppercase font-num">{coin}</span>
                            <span className="text-xs text-text font-num mt-1 block">{data.free.toFixed(4)}</span>
                            {data.used > 0 && (
                              <span className="text-[9px] text-warn mt-1 font-num block">In Orders: {data.used.toFixed(4)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </GlowPanel>

      {/* Configure API Key */}
      <GlowPanel>
        <SectionHeader
          title="Configure API Key"
          subtitle="Credentials are encrypted at rest with Fernet"
          accentColor="white"
        />
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <Select label="Exchange" value={selectedExchange} onChange={e => setSelectedExchange(e.target.value)}>
            {EXCHANGES.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </Select>
          <Input
            label="Connection Name"
            required
            value={keyName}
            onChange={e => setKeyName(e.target.value)}
            placeholder="e.g. Production Wallet"
          />
          <Input
            label="API Key"
            type="password"
            mono
            required
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="••••••••••••••••"
          />
          <Input
            label="Secret Key"
            type="password"
            mono
            required
            value={apiSecret}
            onChange={e => setApiSecret(e.target.value)}
            placeholder="••••••••••••••••"
          />
          {needsPassphrase && (
            <div className="col-span-1 md:col-span-2">
              <Input
                label="Passphrase"
                type="password"
                mono
                required
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                placeholder="API Passphrase"
                hint="Required for OKX and KuCoin keys."
              />
            </div>
          )}

          <div className="col-span-1 md:col-span-2 flex items-center justify-between pt-4 border-t border-border mt-2">
            <label className="flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isSandbox}
                  onChange={e => setIsSandbox(e.target.checked)}
                  className="w-3.5 h-3.5 accent-accent bg-inset border-border rounded-sm cursor-pointer"
                />
                <span className="ml-2 text-xs text-muted group-hover:text-text transition-colors font-bold uppercase tracking-wider">
                  Sandbox Environment (Testnet)
                </span>
            </label>
            <Button type="submit" loading={loading}>
              {loading ? 'Verifying…' : 'Save Connection'}
            </Button>
          </div>
        </form>
      </GlowPanel>
    </PageShell>
  );
}
