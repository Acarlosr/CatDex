const NAV_ITEMS = [
  {
    key: 'settings',
    label: 'Exchange Setup',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    key: 'bots',
    label: 'Algorithms',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'manager',
    label: 'Data Vault',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2 3.582 3 8 3s8-1 8-3V7M4 7c0 2 3.582 3 8 3s8-1 8-3M4 7c0-2 3.582-3 8-3s8 1 8 3m0 5c0 2-3.582 3-8 3s-8-1-8-3" />
      </svg>
    ),
  },
  {
    key: 'trades',
    label: 'Trade Analytics',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
];

export default function Sidebar({ activeView, setActiveView, openCharts, closeChart, runningBots, openBotChart, sidebarOpen, setSidebarOpen }) {
  return (
    <aside className={`fixed inset-y-0 left-0 z-[80] w-64 bg-raised/95 backdrop-blur-xl border-r border-border flex flex-col shadow-2xl transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>

      {/* Wordmark */}
      <div
        className="relative p-4 border-b border-border flex justify-between items-center cursor-pointer overflow-hidden group"
        onClick={() => setActiveView('home')}
      >
        <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full blur-[60px] bg-accent/5 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
        <div className="relative flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0 group-hover:shadow-glow-accent transition-shadow duration-300">
            <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-[0.2em] text-white leading-none">
              APEX<span className="text-accent">ALGO</span>
            </h1>
            <p className="text-faint text-[9px] mt-1 uppercase tracking-wider font-num">Engine Core</p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); }}
          aria-label="Close sidebar"
          className="relative text-muted hover:text-danger transition-colors p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto pb-24 md:pb-3">
        <p className="px-3 pt-1 pb-2 text-[9px] font-bold text-faint uppercase tracking-[0.2em]">Terminal</p>

        {NAV_ITEMS.map(item => {
          const active = activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key)}
              className={`relative w-full flex items-center gap-3 text-left px-3 py-2.5 md:py-2 text-xs font-semibold tracking-wide rounded-md transition-all duration-200 group ${
                active
                  ? 'bg-overlay text-text shadow-sm'
                  : 'text-muted hover:bg-overlay/50 hover:text-text'
              }`}
            >
              <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-full bg-accent transition-all duration-200 ${active ? 'h-5 opacity-100' : 'h-0 opacity-0'}`} />
              <span className={`shrink-0 transition-colors duration-200 ${active ? 'text-accent' : 'text-faint group-hover:text-muted'}`}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}

        {runningBots && runningBots.length > 0 && (
          <div className="pt-5 pb-2 px-3 flex items-center border-t border-border/50 mt-4">
            <span className="w-1.5 h-1.5 bg-success rounded-full mr-2 animate-pulse shadow-[0_0_12px_#2ebd85]"></span>
            <span className="text-[9px] font-bold text-faint uppercase tracking-[0.2em]">Live Engines</span>
          </div>
        )}

        {runningBots && runningBots.map(bot => (
          <button
            key={`bot_${bot.id}`}
            onClick={() => openBotChart(bot)}
            className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 md:py-2 text-xs font-semibold text-text-secondary hover:bg-overlay/50 hover:text-text transition-all duration-200 rounded-md truncate group"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success/70 shrink-0 group-hover:bg-success transition-colors" />
            <span className="truncate">{bot.name}</span>
          </button>
        ))}

        {openCharts.length > 0 && (
          <div className="pt-5 pb-2 px-3 border-t border-border/50 mt-4">
            <span className="text-[9px] font-bold text-faint uppercase tracking-[0.2em]">Active Charts</span>
          </div>
        )}

        {openCharts.map(chart => (
          <div key={chart.id} className={`flex items-center justify-between px-3 py-2 md:py-1.5 text-xs font-semibold rounded-md transition-all duration-200 border ${
            activeView === chart.id
              ? 'bg-overlay text-text border-border'
              : 'text-muted hover:bg-overlay/40 hover:text-text border-transparent hover:border-border/50'
          }`}>
            <button className="flex-1 flex items-center gap-2 text-left truncate py-1.5 md:py-0" onClick={() => setActiveView(chart.id)}>
              <span className="truncate">{chart.symbol}</span>
              <span className="text-[9px] text-accent border border-accent/30 bg-accent/5 px-1.5 py-0.5 rounded font-num shrink-0">{chart.timeframe}</span>
            </button>
            <button
              onClick={(e) => closeChart(chart.id, e)}
              aria-label={`Close ${chart.symbol} chart`}
              className="text-faint hover:text-danger ml-2 px-2 py-1 md:px-1 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </nav>

      {/* Footer status */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-inset/60 border border-border/60">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_#2ebd85]" />
            <span className="text-[9px] font-bold text-muted uppercase tracking-widest">Online</span>
          </div>
          <span className="text-[9px] font-num text-faint">v0.1.0-alpha</span>
        </div>
      </div>
    </aside>
  );
}
