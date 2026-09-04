import { useState, useRef, memo, useCallback } from 'react';
import { apiClient } from '../api/client';
import PageShell from './ui/PageShell';
import SectionHeader from './ui/SectionHeader';
import Button from './ui/Button';
import Badge from './ui/Badge';
import EmptyState from './ui/EmptyState';
import { toast } from './ui/Toast';
import { confirmDialog } from './ui/ConfirmDialog';
import BotConsole from './BotConsole';

/* ── Inline icons (stroke 1.8) ── */
const IconEdit = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49a1.9 1.9 0 112.69 2.69L7.5 19.23 4 20l.77-3.5L16.86 4.49z" />
  </svg>
);
const IconExport = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </svg>
);
const IconDuplicate = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);
const IconBroom = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l7.5 7.5M9 13l-5 7h16l-3.5-9.5L9 13z" />
  </svg>
);
const IconTrash = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-.8 12.1A2 2 0 0115.2 21H8.8a2 2 0 01-2-1.9L6 7m4 4v6m4-6v6" />
  </svg>
);
const IconPlay = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 5.5v13l11-6.5-11-6.5z" />
  </svg>
);
const IconStop = (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconBotEmpty = (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
    <rect x="5" y="8" width="14" height="11" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8V4m0 0h3M9 13h.01M15 13h.01M9.5 16.5h5" />
  </svg>
);

/* Small icon-button used in the card footer */
function IconButton({ title, onClick, disabled, tone = 'muted', children }) {
  const tones = {
    muted:  'text-muted hover:text-text hover:bg-overlay',
    info:   'text-info hover:bg-info/10',
    warn:   'text-warn hover:bg-warn/10',
    danger: 'text-danger hover:bg-danger/10',
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md border border-transparent transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none ${tones[tone] || tones.muted}`}
    >
      {children}
    </button>
  );
}

const BotCard = memo(function BotCard({ bot, index, busyAction, togglingBot, openConsoles, clearSignals, toggleBotState, handleExport, handleDuplicate, handleClearCacheClick, handleDeleteClick, updateBotConfig, toggleConsole }) {
  const isBacktestOn     = bot.settings?.backtest_on_start === true;
  const isApiExecutionOn = bot.settings?.api_execution === true;
  const hasApiKey        = !!bot.settings?.api_key_name;
  const consoleOpen      = openConsoles[bot.id] ?? false;
  const isToggling       = togglingBot === bot.id;

  const assignedPairs = Array.isArray(bot.settings?.symbols)
    ? bot.settings.symbols
    : (bot.settings?.symbol ? [bot.settings.symbol] : []);
  const visiblePairs = assignedPairs.slice(0, 3);
  const extraPairs   = assignedPairs.length - visiblePairs.length;

  return (
    <div
      className={`terminal-card flex flex-col overflow-hidden transition-all duration-300 hover:border-border-strong ${
        bot.is_active ? 'border-success/30' : ''
      } fade-in-delay-${Math.min(index + 1, 6)}`}
    >
      {/* ── Card Header: status hierarchy + primary action ── */}
      <div className="px-5 py-4 border-b border-border flex justify-between items-start gap-3 bg-gradient-to-r from-bg/60 to-raised/40">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-text font-bold text-sm tracking-wide truncate">{bot.name}</h3>
            {bot.is_active
              ? <Badge variant="success" dot pulse>Running</Badge>
              : <Badge variant="neutral" dot>Stopped</Badge>}
            {isApiExecutionOn
              ? <Badge variant="accent">Live</Badge>
              : <Badge variant="info">Paper</Badge>}
            {isBacktestOn && <Badge variant="purple">Backtest</Badge>}
          </div>

          {/* Metrics row */}
          <div className="flex items-center gap-4 mt-2.5 flex-wrap">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-wider text-faint">Timeframe</span>
              <span className="text-[11px] font-num font-bold text-accent">{bot.settings?.timeframe || 'N/A'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-wider text-faint">Pairs</span>
              <span className="text-[11px] font-num font-bold text-text">{assignedPairs.length}</span>
            </div>
            <div className="flex flex-col min-w-0" title={assignedPairs.join(', ')}>
              <span className="text-[9px] font-bold uppercase tracking-wider text-faint">Whitelist</span>
              <span className="flex items-center gap-1 flex-wrap">
                {visiblePairs.length === 0 && <span className="text-[10px] text-faint">—</span>}
                {visiblePairs.map(pair => (
                  <span key={pair} className="text-[9px] font-num font-bold text-text-secondary bg-inset border border-border rounded-sm px-1.5 py-0.5">
                    {pair}
                  </span>
                ))}
                {extraPairs > 0 && (
                  <span className="text-[9px] font-num text-muted">+{extraPairs}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        <Button
          variant={bot.is_active ? 'danger' : 'success'}
          size="md"
          loading={isToggling}
          icon={bot.is_active ? IconStop : IconPlay}
          onClick={() => toggleBotState(bot.id, bot.is_active)}
          title={bot.is_active ? 'Stop this bot' : 'Start the trading engine'}
          className="shrink-0"
        >
          {bot.is_active ? 'Stop' : 'Start'}
        </Button>
      </div>

      {/* ── Card Body ── */}
      <div className="px-5 py-4 flex-1 flex flex-col space-y-5">

        {/* Environment Routing */}
        <div className="flex flex-col space-y-2">
          <div className="flex justify-between items-end">
            <span className="text-[9px] font-bold text-muted uppercase tracking-wider">Environment Routing</span>
            {!hasApiKey && <span className="text-[8px] font-bold uppercase text-danger">No API Key Linked</span>}
          </div>
          <div className="flex bg-inset rounded-md border border-border overflow-hidden">
            <button
              disabled={bot.is_active}
              onClick={() => updateBotConfig(bot.id, bot, { settings: { api_execution: false } })}
              title="Simulate orders locally without touching the exchange."
              className={`flex-1 py-2 text-[9px] font-bold uppercase transition-all duration-200 disabled:opacity-50 ${!isApiExecutionOn ? 'bg-info/10 text-info' : 'text-muted hover:text-text hover:bg-raised'}`}
            >
              Paper Trade
            </button>
            <button
              disabled={bot.is_active || !hasApiKey}
              onClick={() => updateBotConfig(bot.id, bot, { settings: { api_execution: true } })}
              title={!hasApiKey ? 'Assign an API key to enable live/paper routing.' : 'Route orders through API key.'}
              className={`flex-1 py-2 text-[9px] font-bold uppercase transition-all duration-200 border-l border-border disabled:opacity-50 ${isApiExecutionOn ? 'bg-accent/10 text-accent' : 'text-muted hover:text-text hover:bg-raised'}`}
            >
              Live Exchange
            </button>
          </div>
        </div>

        {/* Initialization Protocol */}
        <div className="flex flex-col space-y-2 border-t border-border pt-4">
          <span className="text-[9px] font-bold text-muted uppercase tracking-wider">Initialization Protocol</span>
          <label className={`flex items-center p-3 rounded-md border transition-all duration-200 ${bot.is_active ? 'opacity-50 pointer-events-none cursor-not-allowed' : 'cursor-pointer hover:border-border-strong'} ${isBacktestOn ? 'bg-success/5 border-success/30' : 'bg-inset border-border'}`}>
            <input
              type="checkbox"
              disabled={bot.is_active}
              checked={isBacktestOn}
              onChange={(e) => updateBotConfig(bot.id, bot, { settings: { backtest_on_start: e.target.checked } })}
              className="form-checkbox h-3.5 w-3.5 accent-success rounded-sm cursor-pointer"
            />
            <div className="ml-3 flex flex-col">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${isBacktestOn ? 'text-success' : 'text-text'}`}>Run Historical Backtest</span>
              <span className="text-[9px] text-muted mt-0.5">Process past data before executing live.</span>
            </div>
          </label>
        </div>
      </div>

      {/* ── Console Toggle Bar ── */}
      <button
        onClick={() => toggleConsole(bot.id)}
        title={consoleOpen ? 'Hide console output' : 'Show console output'}
        className="w-full px-5 py-2.5 border-t border-border bg-bg/60 flex justify-between items-center hover:bg-bg transition-colors group"
      >
        <span className="text-[8px] font-bold uppercase tracking-widest text-muted group-hover:text-text transition-colors">
          Console
        </span>
        <ChevronIcon open={consoleOpen} />
      </button>

      {/* ── Console Panel ── */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          consoleOpen ? 'max-h-56 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <BotConsole botName={bot.name} isOpen={consoleOpen} clearSignal={clearSignals[bot.name] || 0} />
      </div>

      {/* ── Card Footer: icon actions ── */}
      <div className="px-4 py-2 bg-bg/50 border-t border-border flex justify-between items-center">
        <span className="text-[9px] font-bold text-faint uppercase tracking-wider font-num">ID {bot.id}</span>
        <div className="flex items-center gap-0.5">
          <IconButton
            title="Edit strategy in the builder"
            tone="info"
            disabled={bot.is_active}
            onClick={() => window.dispatchEvent(new CustomEvent('open-builder', { detail: bot }))}
          >
            {IconEdit}
          </IconButton>
          <IconButton title="Export bot as .apex.json" onClick={() => handleExport(bot)}>
            {IconExport}
          </IconButton>
          <IconButton title="Duplicate bot" disabled={bot.is_active} onClick={() => handleDuplicate(bot)}>
            {IconDuplicate}
          </IconButton>
          <div className="w-px h-3.5 bg-border mx-1" />
          <IconButton
            title="Wipe chart cache (signals & logs)"
            tone="warn"
            disabled={bot.is_active || !!busyAction}
            onClick={() => handleClearCacheClick(bot)}
          >
            {IconBroom}
          </IconButton>
          <IconButton
            title="Delete bot permanently"
            tone="danger"
            disabled={bot.is_active || !!busyAction}
            onClick={() => handleDeleteClick(bot.id, bot.name)}
          >
            {IconTrash}
          </IconButton>
        </div>
      </div>

    </div>
  );
}, (prev, next) =>
  prev.bot.id === next.bot.id &&
  prev.bot.is_active === next.bot.is_active &&
  prev.bot.name === next.bot.name &&
  prev.busyAction === next.busyAction &&
  (prev.togglingBot === prev.bot.id) === (next.togglingBot === next.bot.id) &&
  prev.openConsoles[prev.bot.id] === next.openConsoles[next.bot.id] &&
  prev.clearSignals[prev.bot.name] === next.clearSignals[next.bot.name] &&
  JSON.stringify(prev.bot.settings) === JSON.stringify(next.bot.settings)
);

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-3 h-3 text-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function BotManagerUI({ bots = [], refetchBots }) {
  const [openConsoles, setOpenConsoles] = useState({});
  const [busyAction, setBusyAction]     = useState(null);  // 'delete:ID' or 'wipe:name'
  const [togglingBot, setTogglingBot]   = useState(null);  // bot id being started/stopped
  const [clearSignals, setClearSignals] = useState({});
  const fileInputRef                    = useRef(null);

  const toggleBotState = useCallback(async (botId, isCurrentlyActive) => {
    setTogglingBot(botId);
    try {
      const endpoint = isCurrentlyActive ? `/api/bots/${botId}/stop` : `/api/bots/${botId}/start`;
      await apiClient.post(endpoint);
      refetchBots();
      toast.success(isCurrentlyActive ? 'Bot stopped' : 'Engine started');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to toggle bot state.');
    }
    setTogglingBot(null);
  }, [refetchBots]);

  const handleDeleteClick = useCallback(async (botId, botName) => {
    if (busyAction) return;
    const ok = await confirmDialog({
      title: 'Delete Algorithm',
      message: `Deleting '${botName}' permanently removes its logic and configuration from the database. This cannot be undone.`,
      confirmText: 'Delete',
      type: 'danger',
    });
    if (!ok) return;
    setBusyAction(`delete:${botId}`);
    try {
      await apiClient.delete(`/api/bots/${botId}`);
      refetchBots();
      toast.success(`'${botName}' deleted`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete bot.');
    }
    setBusyAction(null);
  }, [busyAction, refetchBots]);

  const handleClearCacheClick = useCallback(async (bot) => {
    if (busyAction) return;
    const ok = await confirmDialog({
      title: 'Clear Chart Cache',
      message: `Clear all drawn signals and indicator data for '${bot.name}' from the chart? Your trade ledger will remain intact.`,
      confirmText: 'Clear Cache',
      type: 'warning',
    });
    if (!ok) return;
    setBusyAction(`wipe:${bot.name}`);
    try {
      await apiClient.delete(`/api/bots/${encodeURIComponent(bot.name)}/cache`);
      refetchBots();
      setClearSignals(prev => ({ ...prev, [bot.name]: (prev[bot.name] || 0) + 1 }));
      toast.success(`Cache cleared for '${bot.name}'`);
    } catch {
      toast.error('Failed to clear cache.');
    }
    setBusyAction(null);
  }, [busyAction, refetchBots]);

  const updateBotConfig = useCallback(async (botId, currentBot, updates) => {
    try {
      await apiClient.put(`/api/bots/${botId}`, updates);
      refetchBots();
    } catch {
      toast.error('Failed to update bot configuration.');
      refetchBots();
    }
  }, [refetchBots]);

  const handleExport = useCallback(async (bot) => {
    try {
      const res = await apiClient.get(`/api/bots/${bot.id}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bot.name.replace(/\s+/g, '_')}.apex.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`'${bot.name}' exported`);
    } catch {
      toast.error('Failed to export bot.');
    }
  }, []);

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await apiClient.post('/api/bots/import', payload);
      refetchBots();
      toast.success(`'${payload?.bot?.name || 'Bot'}' imported successfully`);
    } catch (err) {
      const raw = err.response?.data?.detail;
      const detail = typeof raw === 'string' ? raw
          : raw?.validation_errors ? raw.validation_errors.join('\n')
          : 'Invalid bot file. The file may be corrupted or from an incompatible version.';
      toast.error(detail);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDuplicate = useCallback(async (bot) => {
    try {
      await apiClient.post(`/api/bots/${bot.id}/duplicate`);
      refetchBots();
      toast.success(`'${bot.name}' duplicated`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to duplicate bot.');
    }
  }, [refetchBots]);

  const toggleConsole = useCallback((botId) => {
    setOpenConsoles(prev => ({ ...prev, [botId]: !prev[botId] }));
  }, []);

  return (
    <PageShell glowColor="green">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".json,.apex.json"
        onChange={handleImportFile}
      />

      <SectionHeader
        title="Trading Algorithms"
        subtitle="Manage, configure, and deploy automated strategies"
        accentColor="white"
        action={
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="md"
              icon={IconExport}
              title="Import a bot from an .apex.json file"
              onClick={() => fileInputRef.current?.click()}
            >
              Import
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => window.dispatchEvent(new CustomEvent('open-builder'))}
            >
              + New Algorithm
            </Button>
          </div>
        }
      />

      {bots.length === 0 ? (
        <div className="terminal-card border-dashed">
          <EmptyState
            icon={IconBotEmpty}
            title="No trading bots yet"
            description="Design a strategy visually in the builder, or import an existing .apex.json bot file to get started."
            action={
              <div className="flex items-center gap-2.5">
                <Button size="sm" onClick={() => window.dispatchEvent(new CustomEvent('open-builder'))}>
                  Open Builder
                </Button>
                <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                  Import File
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {bots.map((bot, index) => (
            <BotCard
              key={bot.id}
              bot={bot}
              index={index}
              busyAction={busyAction}
              togglingBot={togglingBot}
              openConsoles={openConsoles}
              clearSignals={clearSignals}
              toggleBotState={toggleBotState}
              handleExport={handleExport}
              handleDuplicate={handleDuplicate}
              handleClearCacheClick={handleClearCacheClick}
              handleDeleteClick={handleDeleteClick}
              updateBotConfig={updateBotConfig}
              toggleConsole={toggleConsole}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
