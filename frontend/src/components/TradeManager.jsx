import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { apiClient } from '../api/client';
import PageShell from './ui/PageShell';
import Button from './ui/Button';
import { Select } from './ui/Input';
import Badge from './ui/Badge';
import StatCard from './ui/StatCard';
import EmptyState from './ui/EmptyState';
import { Skeleton } from './ui/Skeleton';
import { toast } from './ui/Toast';
import { confirmDialog } from './ui/ConfirmDialog';

// ─── Formatters ──────────────────────────────────────────────────────────────

const safeNum = (val, decimals = 2) => {
    if (val === null || val === undefined || isNaN(Number(val))) return (0).toFixed(decimals);
    return Number(val).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const formatCrypto = (val) => {
    if (val === null || val === undefined) return '0.00';
    return Number(val).toFixed(6).replace(/\.?0+$/, '');
};

const formatHoldTime = (ms) => {
    if (!ms || ms <= 0) return '—';
    const totalMins = Math.floor(ms / 60000);
    const totalHours = Math.floor(totalMins / 60);
    if (totalHours >= 48) return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
    if (totalHours >= 1) return `${totalHours}h ${totalMins % 60}m`;
    return `${totalMins}m`;
};

const pnlColor = (v) => (v >= 0 ? 'text-success' : 'text-danger');
const pnlSign = (v) => (v >= 0 ? '+' : '');

const MODE_BADGE_VARIANT = {
    live: 'success',
    paper: 'info',
    backtest: 'neutral',
    forward_test: 'purple',
};

// ─── Equity Curve SVG ────────────────────────────────────────────────────────

const EquityCurve = ({ data }) => {
    if (data.length < 2) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-2 text-center">
                <svg className="w-8 h-8 text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <p className="text-[10px] text-muted uppercase tracking-wider">Close at least 2 trades to render the curve</p>
            </div>
        );
    }

    const W = 600, H = 140;
    const PAD = { t: 12, r: 8, b: 24, l: 8 };
    const iW = W - PAD.l - PAD.r;
    const iH = H - PAD.t - PAD.b;

    const values = data.map(d => d.value);
    const minV = Math.min(0, ...values);
    const maxV = Math.max(0, ...values);
    const range = maxV - minV || 1;

    const xS = (i) => PAD.l + (i / (data.length - 1)) * iW;
    const yS = (v) => PAD.t + iH - ((v - minV) / range) * iH;

    const zeroY = yS(0);
    const points = data.map((d, i) => `${xS(i)},${yS(d.value)}`).join(' ');
    const areaPath = [
        `M${xS(0)},${zeroY}`,
        `L${xS(0)},${yS(data[0].value)}`,
        ...data.map((d, i) => `L${xS(i)},${yS(d.value)}`),
        `L${xS(data.length - 1)},${zeroY}`,
        'Z',
    ].join(' ');

    const lastVal = data[data.length - 1].value;
    // CSS vars work in SVG style props (not attributes), so paint via style
    const lineClr = lastVal >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    const gradId = lastVal >= 0 ? 'ecGreen' : 'ecRed';

    const firstDate = data[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const lastDate = data[data.length - 1].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: lineClr, stopOpacity: 0.25 }} />
                    <stop offset="100%" style={{ stopColor: lineClr, stopOpacity: 0.01 }} />
                </linearGradient>
            </defs>
            {/* Zero baseline */}
            <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY}
                style={{ stroke: 'var(--color-border)' }} strokeWidth="1" strokeDasharray="3,4" />
            {/* Area fill */}
            <path d={areaPath} fill={`url(#${gradId})`} />
            {/* Line */}
            <polyline points={points} fill="none" style={{ stroke: lineClr }} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            {/* End dot */}
            <circle cx={xS(data.length - 1)} cy={yS(lastVal)} r="2.5" style={{ fill: lineClr }} />
            {/* Date labels */}
            <text x={PAD.l} y={H - 4} style={{ fill: 'var(--color-muted)' }} fontSize="10" fontFamily="JetBrains Mono, monospace">{firstDate}</text>
            <text x={W - PAD.r} y={H - 4} style={{ fill: 'var(--color-muted)' }} fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="end">{lastDate}</text>
        </svg>
    );
};

// ─── Pagination ──────────────────────────────────────────────────────────────

const PaginationBar = ({ total, current, onPrev, onNext }) => total <= 1 ? null : (
    <div className="flex items-center bg-inset rounded-md border border-border overflow-hidden">
        <button disabled={current === 1} onClick={onPrev} className="px-2.5 py-1 hover:bg-overlay disabled:opacity-30 text-muted transition-colors" aria-label="Previous page">&#9664;</button>
        <span className="text-[9px] font-bold text-text px-2 font-num">{current} / {total}</span>
        <button disabled={current === total} onClick={onNext} className="px-2.5 py-1 hover:bg-overlay disabled:opacity-30 text-muted transition-colors" aria-label="Next page">&#9654;</button>
    </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TradeManager({ setError, bots = [] }) {
    const [positions, setPositions] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [activeTab, setActiveTab] = useState('positions');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 150;

    const [livePrices, setLivePrices] = useState({});
    const [priceSyncing, setPriceSyncing] = useState(false);
    const [busyAction, setBusyAction] = useState(false);
    const [closingId, setClosingId] = useState(null);

    const [filterBot, setFilterBot] = useState('all');
    const [filterSymbol, setFilterSymbol] = useState('all');
    const [filterExchange, setFilterExchange] = useState('all');
    const [filterMode, setFilterMode] = useState('all');
    const [filterInterval, setFilterInterval] = useState('all');

    // ── Data fetching ─────────────────────────────────────────────────────────

    const fetchLivePrices = useCallback(async (currentPositions) => {
        const uniqueSymbols = [...new Set(currentPositions.map(p => p.symbol))];
        if (uniqueSymbols.length === 0) return;
        setPriceSyncing(true);
        const priceMap = {};
        const results = await Promise.allSettled(
            uniqueSymbols.map(sym =>
                apiClient.get(`/api/data/market-info/${sym.replace('/', '-')}`)
                    .then(res => ({ sym, price: res.data?.last }))
            )
        );
        results.forEach(r => {
            if (r.status === 'fulfilled' && r.value.price) priceMap[r.value.sym] = r.value.price;
        });
        setLivePrices(prev => ({ ...prev, ...priceMap }));
        setPriceSyncing(false);
    }, []);

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            const [posRes, ordRes] = await Promise.all([
                apiClient.get('/api/trades/positions', { params: { limit: 0 } }),
                apiClient.get('/api/trades/orders', { params: { limit: 0 } }),
            ]);
            const pos = posRes.data || [];
            const ord = ordRes.data || [];
            setPositions(pos);
            setOrders(ord);
            if (setError) setError(null);
            fetchLivePrices(pos);
        } catch (err) {
            if (setError) setError(err.response?.data?.detail || 'Failed to load analytics data.');
        }
        setLoading(false);
        setHasLoadedOnce(true);
    }, [setError, fetchLivePrices]);

    useEffect(() => {
        const controller = new AbortController();
        fetchAllData(); // eslint-disable-line react-hooks/set-state-in-effect -- initial data load on mount
        return () => controller.abort();
    }, [fetchAllData]);

    const positionsRef = useRef(positions);
    useEffect(() => {
        positionsRef.current = positions;
    }, [positions]);

    useEffect(() => {
        if (positions.length === 0) return;
        const t = setInterval(() => fetchLivePrices(positionsRef.current), 10000);
        return () => clearInterval(t);
    }, [positions.length, fetchLivePrices]);

    // ── Filters ───────────────────────────────────────────────────────────────

    // Positions don't carry a timeframe; resolve it through the owning bot
    const tfByBot = useMemo(() => {
        const map = {};
        bots.forEach(b => { map[b.name] = b.settings?.timeframe || null; });
        return map;
    }, [bots]);

    const applyFilters = useCallback((arr) =>
        arr
            .filter(x => filterBot === 'all' || x.bot_name === filterBot)
            .filter(x => filterSymbol === 'all' || x.symbol === filterSymbol)
            .filter(x => filterExchange === 'all' || (x.exchange || 'okx') === filterExchange)
            .filter(x => filterMode === 'all' || x.mode === filterMode)
            .filter(x => filterInterval === 'all' || tfByBot[x.bot_name] === filterInterval),
    [filterBot, filterSymbol, filterExchange, filterMode, filterInterval, tfByBot]);

    const resetPage = () => setCurrentPage(1);

    const closedPositions = useMemo(() =>
        applyFilters(positions.filter(p => p.status === 'closed'))
            .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at)),
    [positions, applyFilters]);

    const activePositions = useMemo(() =>
        applyFilters(positions.filter(p => p.status === 'open')),
    [positions, applyFilters]);

    const filteredOrders = useMemo(() =>
        applyFilters(orders).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [orders, applyFilters]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const deleteHistoricalTrade = async (id) => {
        const ok = await confirmDialog({
            title: 'Delete Trade Record',
            message: 'Permanently delete this trade from the ledger? This will affect your statistics.',
            confirmText: 'Delete',
            type: 'danger',
        });
        if (!ok) return;
        setBusyAction(true);
        try {
            await apiClient.delete(`/api/trades/positions/${id}`);
            toast.success('Trade record deleted.');
            fetchAllData();
        } catch {
            toast.error('Failed to delete trade.');
        }
        setBusyAction(false);
    };

    const forceClosePosition = async (id) => {
        const ok = await confirmDialog({
            title: 'Force Close Position',
            message: 'Close this position at the last known local market price? It will be added to your Historical Ledger.',
            confirmText: 'Force Close',
            type: 'warning',
        });
        if (!ok) return;
        setBusyAction(true);
        setClosingId(id);
        try {
            const res = await apiClient.post(`/api/trades/positions/${id}/close`);
            toast.success(res.data?.message || 'Position closed.');
            fetchAllData();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Failed to close position.');
        }
        setClosingId(null);
        setBusyAction(false);
    };

    const bulkDelete = async () => {
        if (closedPositions.length === 0) return;
        const ok = await confirmDialog({
            title: 'Bulk Delete Trades',
            message: `WARNING: Permanently delete ALL ${closedPositions.length} historical trades matching your current filters?`,
            confirmText: 'Delete All Filtered',
            type: 'danger',
        });
        if (!ok) return;
        setBusyAction(true);
        try {
            const ids = closedPositions.map(p => p.id);
            await apiClient.post('/api/trades/positions/bulk-delete', ids);
            toast.success(`Deleted ${ids.length} historical trades.`);
            fetchAllData();
        } catch {
            toast.error('Failed to delete trades.');
        }
        setBusyAction(false);
    };

    // ── Unique filter options ─────────────────────────────────────────────────

    const uniqueBots = useMemo(() => [...new Set(positions.map(p => p.bot_name).filter(Boolean))], [positions]);
    const uniqueSymbols = useMemo(() => [...new Set([...positions, ...orders].map(x => x.symbol).filter(Boolean))], [positions, orders]);
    const uniqueExchanges = useMemo(() => [...new Set([...positions, ...orders].map(x => x.exchange || 'okx').filter(Boolean))], [positions, orders]);
    const uniqueIntervals = useMemo(() => [...new Set(positions.map(p => tfByBot[p.bot_name]).filter(Boolean))].sort(), [positions, tfByBot]);

    // When a single bot is selected, prefer the drawdown the engine measured
    // and enforces (mark-to-market over the backtest, incl. open-position dips)
    const engineDrawdown = useMemo(() => {
        if (filterBot === 'all') return null;
        const dd = bots.find(b => b.name === filterBot)?.settings?.last_backtest_max_drawdown;
        return (dd === null || dd === undefined) ? null : dd;
    }, [filterBot, bots]);

    // ── Pre-computed lookups (shared by stats + ledger rows) ───────────────

    const feesByPosId = useMemo(() => {
        const map = {};
        for (const o of orders) {
            if (o.position_id && o.fee) {
                map[o.position_id] = (map[o.position_id] || 0) + o.fee;
            }
        }
        return map;
    }, [orders]);

    const entryTsByPos = useMemo(() => {
        const map = {};
        for (const o of orders) {
            if (o.side === 'buy' && o.status === 'filled' && o.position_id && o.timestamp) {
                const t = new Date(o.timestamp);
                if (!map[o.position_id] || t < map[o.position_id]) map[o.position_id] = t;
            }
        }
        return map;
    }, [orders]);

    // ── Stats ─────────────────────────────────────────────────────────────────

    const stats = useMemo(() => {
        const wins = closedPositions.filter(p => (p.profit_abs || 0) > 0);
        const losses = closedPositions.filter(p => (p.profit_abs || 0) <= 0);
        const grossProfit = wins.reduce((s, p) => s + (p.profit_abs || 0), 0);
        const grossLoss = Math.abs(losses.reduce((s, p) => s + (p.profit_abs || 0), 0));
        const netPnl = grossProfit - grossLoss;
        const winRate = closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);

        // Max drawdown — percentage of peak equity using backtest_capital as starting equity
        const sorted = [...closedPositions].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
        // Look up backtest_capital from bot config (default $1000)
        const filteredBotNames = [...new Set(sorted.map(p => p.bot_name).filter(Boolean))];
        const capitalPerBot = filteredBotNames.map(name => {
            const bot = bots.find(b => b.name === name);
            return bot?.settings?.backtest_capital || 1000;
        });
        // Per-bot capital is a separate pool, so total deployed capital is the
        // sum across the bots in view; a single bot is just its own pool.
        const startingCapital = capitalPerBot.length > 0 ? Math.max(...capitalPerBot) : 1000;
        const totalCapital = capitalPerBot.length > 0 ? capitalPerBot.reduce((a, b) => a + b, 0) : 1000;

        let equity = startingCapital, peakEq = startingCapital, maxDDpct = 0;
        for (const p of sorted) {
            equity += (p.profit_abs || 0);
            if (equity > peakEq) peakEq = equity;
            if (peakEq > 0) maxDDpct = Math.max(maxDDpct, ((peakEq - equity) / peakEq) * 100);
        }

        // Avg hold time — use entry order timestamps as fallback for backtest positions
        // whose created_at may be the wall-clock run time, not the candle entry time
        const holdTimes = closedPositions.map(p => {
            if (!p.closed_at) return null;
            const closedTs = new Date(p.closed_at);
            if (p.created_at) {
                const createdTs = new Date(p.created_at);
                if (closedTs > createdTs) return closedTs - createdTs;
            }
            const entryTs = entryTsByPos[p.id];
            if (entryTs && closedTs > entryTs) return closedTs - entryTs;
            return null;
        }).filter(t => t !== null);
        const avgHoldMs = holdTimes.length > 0
            ? holdTimes.reduce((s, t) => s + t, 0) / holdTimes.length
            : 0;

        // Return/Risk (simplified Sharpe)
        const returns = closedPositions.map(p => p.profit_pct || 0);
        const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
        const stddev = returns.length > 1
            ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1))
            : 0;
        const sharpe = stddev > 0 ? mean / stddev : 0;

        // Total fees from orders linked to filtered positions
        const filteredPosIds = new Set(closedPositions.map(p => p.id));
        const totalFees = orders
            .filter(o => o.position_id && filteredPosIds.has(o.position_id))
            .reduce((s, o) => s + (o.fee || 0), 0);

        return {
            netPnl,
            winRate,
            wins: wins.length,
            losses: losses.length,
            total: closedPositions.length,
            profitFactor,
            maxDDpct,
            avgHoldMs,
            sharpe,
            totalFees,
            avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
            avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
            totalCapital,
            botCount: filteredBotNames.length,
            returnPct: totalCapital > 0 ? (netPnl / totalCapital) * 100 : 0,
        };
    }, [closedPositions, orders, entryTsByPos, bots]);

    // ── Equity curve data ─────────────────────────────────────────────────────

    const equityCurveData = useMemo(() => {
        const sorted = [...closedPositions].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
        const result = [];
        let cum = 0;
        for (const p of sorted) {
            cum += (p.profit_abs || 0);
            result.push({ date: new Date(p.closed_at), value: cum });
        }
        return result;
    }, [closedPositions]);

    // ── Buy & Hold comparison ─────────────────────────────────────────────────

    const buyAndHoldData = useMemo(() => {
        const bySymbol = {};
        // Scan ALL filtered positions (open + closed) so the reference entry price
        // reflects the true first entry even when that position is still open
        for (const p of [...activePositions, ...closedPositions]) {
            if (!p.symbol || !p.created_at || !p.entry_price) continue;
            if (!bySymbol[p.symbol]) {
                bySymbol[p.symbol] = { firstDate: new Date(p.created_at), firstPrice: p.entry_price, positions: [] };
            }
            const s = bySymbol[p.symbol];
            if (new Date(p.created_at) < s.firstDate) {
                s.firstDate = new Date(p.created_at);
                s.firstPrice = p.entry_price;
            }
        }
        // Strategy P&L only from closed positions
        for (const p of closedPositions) {
            if (bySymbol[p.symbol]) bySymbol[p.symbol].positions.push(p);
        }
        return Object.entries(bySymbol)
            .filter(([, d]) => d.positions.length > 0)
            .map(([symbol, d]) => {
                const strategyPnl = d.positions.reduce((s, p) => s + (p.profit_abs || 0), 0);
                // Strategy % = total PnL / backtest_capital — same $1000 base as B&H comparison
                const botNames = [...new Set(d.positions.map(p => p.bot_name).filter(Boolean))];
                const botCapitals = botNames.map(name => {
                    const bot = bots.find(b => b.name === name);
                    return bot?.settings?.backtest_capital || 1000;
                });
                const capital = botCapitals.length > 0 ? Math.max(...botCapitals) : 1000;
                const strategyPct = capital > 0 ? (strategyPnl / capital) * 100 : 0;
                const curPrice = livePrices[symbol];
                const bhPct = (curPrice && d.firstPrice > 0)
                    ? ((curPrice - d.firstPrice) / d.firstPrice) * 100
                    : null;
                const edge = bhPct !== null ? strategyPct - bhPct : null;
                return { symbol, strategyPct, bhPct, edge, strategyPnl };
            });
    }, [closedPositions, activePositions, livePrices, bots]);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const getLivePnl = (pos) => {
        const cur = livePrices[pos.symbol];
        if (!cur) return { abs: 0, pct: 0 };
        const isLong = pos.side !== 'short';
        const abs = isLong ? (cur - pos.entry_price) * pos.amount : (pos.entry_price - cur) * pos.amount;
        const pct = isLong ? ((cur - pos.entry_price) / pos.entry_price) * 100 : ((pos.entry_price - cur) / pos.entry_price) * 100;
        return { abs, pct };
    };

    const getExitPrice = (pos) => {
        if (!pos.profit_abs || !pos.entry_price || !pos.amount) return null;
        return pos.side === 'short'
            ? pos.entry_price - pos.profit_abs / pos.amount
            : pos.entry_price + pos.profit_abs / pos.amount;
    };

    // ── CSV Export ────────────────────────────────────────────────────────────

    const exportToCSV = () => {
        if (activeTab === 'positions') {
            if (closedPositions.length === 0) { toast.info('No trades to export for the current filters.'); return; }
            const headers = ['Date Closed', 'Bot', 'Exchange', 'Mode', 'Symbol', 'Side', 'Entry', 'Exit', 'Amount', 'Hold Time', 'Return %', 'Net PNL', 'Fees'];
            const rows = closedPositions.map(p => {
                const fees = feesByPosId[p.id] || 0;
                const holdMs = p.closed_at && p.created_at ? new Date(p.closed_at) - new Date(p.created_at) : 0;
                const exit = getExitPrice(p);
                return [
                    new Date(p.closed_at).toISOString(),
                    p.bot_name, p.exchange || 'okx', p.mode, p.symbol, p.side,
                    p.entry_price, exit?.toFixed(6) ?? '', p.amount,
                    formatHoldTime(holdMs), p.profit_pct, p.profit_abs, fees.toFixed(4),
                ].join(',');
            });
            triggerDownload([headers.join(','), ...rows].join('\n'), 'apex_positions_ledger');
            toast.success(`Exported ${closedPositions.length} trades to CSV.`);
        } else {
            if (filteredOrders.length === 0) { toast.info('No orders to export for the current filters.'); return; }
            const headers = ['Timestamp', 'Bot', 'Exchange', 'Mode', 'Symbol', 'Side', 'Type', 'Price', 'Amount', 'Fee', 'Status'];
            const rows = filteredOrders.map(o => [
                new Date(o.timestamp).toISOString(),
                o.bot_name, o.exchange || 'okx', o.mode, o.symbol,
                o.side, o.order_type, o.price, o.amount, o.fee ?? '', o.status,
            ].join(','));
            triggerDownload([headers.join(','), ...rows].join('\n'), 'apex_raw_orders');
            toast.success(`Exported ${filteredOrders.length} orders to CSV.`);
        }
    };

    const triggerDownload = (csv, prefix) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${prefix}_${new Date().toISOString().split('T')[0]}.csv`;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ── Pagination ────────────────────────────────────────────────────────────

    const totalPagesPos = Math.ceil(closedPositions.length / itemsPerPage);
    const totalPagesOrd = Math.ceil(filteredOrders.length / itemsPerPage);
    const renderedPositions = closedPositions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const renderedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // ── Shared styles ─────────────────────────────────────────────────────────

    const tabClass = (active) => `pb-2.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 border-b-2 ${active ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-text'}`;
    const thClass = 'px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-muted whitespace-nowrap';

    const initialLoading = loading && !hasLoadedOnce;

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <PageShell glowColor="cyan">

            {/* ── FILTER BAR ─────────────────────────────────────────────────── */}
            <div className="terminal-card px-4 py-3 sticky top-0 z-20">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1 min-w-[280px] max-w-[880px]">
                        <Select label="Algorithm" value={filterBot} onChange={e => { setFilterBot(e.target.value); resetPage(); }} className="py-1.5! text-xs!">
                            <option value="all">All Bots</option>
                            {uniqueBots.map(b => <option key={b} value={b}>{b}</option>)}
                        </Select>
                        <Select label="Interval" value={filterInterval} onChange={e => { setFilterInterval(e.target.value); resetPage(); }} className="py-1.5! text-xs! font-num">
                            <option value="all">All Intervals</option>
                            {uniqueIntervals.map(tf => <option key={tf} value={tf}>{tf}</option>)}
                        </Select>
                        <Select label="Asset" value={filterSymbol} onChange={e => { setFilterSymbol(e.target.value); resetPage(); }} className="py-1.5! text-xs! font-num">
                            <option value="all">All Pairs</option>
                            {uniqueSymbols.map(s => <option key={s} value={s}>{s}</option>)}
                        </Select>
                        <Select label="Exchange" value={filterExchange} onChange={e => { setFilterExchange(e.target.value); resetPage(); }} className="py-1.5! text-xs!">
                            <option value="all">All Exchanges</option>
                            {uniqueExchanges.map(ex => <option key={ex} value={ex}>{ex.toUpperCase()}</option>)}
                        </Select>
                        <Select label="Mode" value={filterMode} onChange={e => { setFilterMode(e.target.value); resetPage(); }} className="py-1.5! text-xs!">
                            <option value="all">All Modes</option>
                            <option value="live">Live</option>
                            <option value="paper">Paper</option>
                            <option value="backtest">Backtest</option>
                            <option value="forward_test">Forward Test</option>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 pb-0.5">
                        <Button variant="ghost" size="sm" onClick={exportToCSV}
                            icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}>
                            Export
                        </Button>
                        <Button variant="secondary" size="sm" onClick={fetchAllData} loading={loading}>Sync</Button>
                    </div>
                </div>
            </div>

            {/* ── STATS GRID ─────────────────────────────────────────────────── */}
            {initialLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-[88px] w-full rounded-lg" />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard
                        label="Net PNL"
                        value={`${stats.netPnl >= 0 ? '+' : '-'}$${safeNum(Math.abs(stats.netPnl))}`}
                        sub={stats.total > 0 ? `${stats.returnPct >= 0 ? '+' : ''}${safeNum(stats.returnPct, 1)}% on $${safeNum(stats.totalCapital, 0)}` : 'no closed trades'}
                        color={stats.netPnl >= 0 ? 'green' : 'red'}
                    />
                    <StatCard
                        label="Starting Capital"
                        value={`$${safeNum(stats.totalCapital, 0)}`}
                        sub={stats.botCount > 1 ? `total across ${stats.botCount} bots` : 'allocated to this bot'}
                        color="gold"
                    />
                    <StatCard
                        label="Win Rate"
                        value={`${safeNum(stats.winRate, 1)}%`}
                        sub={`${stats.wins} wins / ${stats.losses} losses`}
                        color="cyan"
                    />
                    <StatCard
                        label="Profit Factor"
                        value={stats.profitFactor >= 999 ? '∞' : safeNum(stats.profitFactor)}
                        sub="gross profit / gross loss"
                        color="gold"
                    />
                    <StatCard
                        label="Max Drawdown"
                        value={engineDrawdown !== null
                            ? `-${safeNum(engineDrawdown, 1)}%`
                            : (stats.total > 0 ? `-${safeNum(stats.maxDDpct, 1)}%` : '—')}
                        sub={engineDrawdown !== null
                            ? 'engine: mark-to-market (backtest)'
                            : 'closed trades only — intra-trade dips not included'}
                        color="red"
                    />
                    <StatCard
                        label="Avg Win"
                        value={stats.wins > 0 ? `+$${safeNum(stats.avgWin)}` : '—'}
                        sub="per winning trade"
                        color="green"
                    />
                    <StatCard
                        label="Avg Loss"
                        value={stats.losses > 0 ? `-$${safeNum(stats.avgLoss)}` : '—'}
                        sub="per losing trade"
                        color="red"
                    />
                    <StatCard
                        label="Avg Hold Time"
                        value={stats.total > 0 ? formatHoldTime(stats.avgHoldMs) : '—'}
                        sub="per closed position"
                        color="white"
                    />
                    <StatCard
                        label="Total Fees Paid"
                        value={stats.total > 0 ? `-$${safeNum(stats.totalFees)}` : '—'}
                        sub="all linked orders"
                        color={stats.totalFees > 0 ? 'red' : 'white'}
                    />
                    <StatCard
                        label="Return / Risk"
                        value={stats.total > 1 ? safeNum(stats.sharpe) : '—'}
                        sub="mean return ÷ std dev"
                        color={stats.sharpe > 1 ? 'green' : stats.sharpe > 0 ? 'gold' : 'red'}
                    />
                </div>
            )}

            {/* ── EQUITY CURVE + BUY & HOLD ──────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row gap-4">

                {/* Equity Curve */}
                <div className="terminal-card glow-panel-cyan p-5 flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-[11px] font-bold uppercase tracking-wider text-text">Equity Curve</h2>
                            <p className="text-[9px] text-muted mt-0.5 uppercase tracking-wider">Cumulative PNL — closed trades</p>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Legend */}
                            <div className="hidden sm:flex items-center gap-3 text-[9px] text-muted uppercase tracking-wider">
                                <span className="flex items-center gap-1.5">
                                    <span className={`w-3 h-0.5 rounded-full ${equityCurveData.length >= 2 && equityCurveData[equityCurveData.length - 1].value < 0 ? 'bg-danger' : 'bg-success'}`} />
                                    Cumulative PNL
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 border-t border-dashed border-border-strong" />
                                    Break-even
                                </span>
                            </div>
                            {equityCurveData.length >= 2 && (
                                <span className={`text-sm font-num font-bold ${pnlColor(equityCurveData[equityCurveData.length - 1].value)}`}>
                                    {pnlSign(equityCurveData[equityCurveData.length - 1].value)}${safeNum(Math.abs(equityCurveData[equityCurveData.length - 1].value))}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="h-[160px] w-full">
                        {initialLoading ? <Skeleton className="w-full h-full rounded-md" /> : <EquityCurve data={equityCurveData} />}
                    </div>
                </div>

                {/* Buy & Hold Comparison */}
                <div className="terminal-card p-5 lg:w-[340px] shrink-0">
                    <div className="mb-4">
                        <h2 className="text-[11px] font-bold uppercase tracking-wider text-text">Strategy vs Buy & Hold</h2>
                        <p className="text-[9px] text-muted mt-0.5 uppercase tracking-wider">Per symbol — from first entry to now</p>
                    </div>

                    {initialLoading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-20 w-full rounded-lg" />
                            <Skeleton className="h-20 w-full rounded-lg" />
                        </div>
                    ) : buyAndHoldData.length === 0 ? (
                        <div className="flex items-center justify-center h-32 text-muted text-[10px] text-center">
                            No closed trades to compare.<br />Close positions to see the comparison.
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                            {buyAndHoldData.map(d => (
                                <div key={d.symbol} className="bg-bg/50 border border-border rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-bold text-text font-num">{d.symbol}</span>
                                        {d.edge !== null && (
                                            <span className={`text-[9px] font-bold font-num px-1.5 py-0.5 rounded ${d.edge >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                                                {d.edge >= 0 ? '↑' : '↓'} Edge: {pnlSign(d.edge)}{safeNum(d.edge, 1)}%
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        {/* Strategy bar */}
                                        <div>
                                            <div className="flex justify-between mb-0.5">
                                                <span className="text-[9px] text-muted uppercase font-bold">Strategy</span>
                                                <span className={`text-[9px] font-num font-bold ${pnlColor(d.strategyPct)}`}>
                                                    {pnlSign(d.strategyPct)}{safeNum(d.strategyPct, 1)}%
                                                </span>
                                            </div>
                                            <div className="h-1 bg-border rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${d.strategyPct >= 0 ? 'bg-success' : 'bg-danger'}`}
                                                    style={{ width: `${Math.min(100, Math.abs(d.strategyPct))}%` }}
                                                />
                                            </div>
                                        </div>
                                        {/* Buy & Hold bar */}
                                        <div>
                                            <div className="flex justify-between mb-0.5">
                                                <span className="text-[9px] text-muted uppercase font-bold">Buy & Hold</span>
                                                <span className={`text-[9px] font-num font-bold ${d.bhPct !== null ? pnlColor(d.bhPct) : 'text-muted'}`}>
                                                    {d.bhPct !== null ? `${pnlSign(d.bhPct)}${safeNum(d.bhPct, 1)}%` : (priceSyncing ? 'Loading…' : 'N/A')}
                                                </span>
                                            </div>
                                            <div className="h-1 bg-border rounded-full overflow-hidden">
                                                {d.bhPct !== null && (
                                                    <div
                                                        className={`h-full rounded-full transition-all opacity-50 ${d.bhPct >= 0 ? 'bg-info' : 'bg-danger'}`}
                                                        style={{ width: `${Math.min(100, Math.abs(d.bhPct))}%` }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* price refresh happens silently in the background */}
                </div>
            </div>

            {/* ── ACTIVE POSITIONS ───────────────────────────────────────────── */}
            {activePositions.length > 0 && (
                <div className="terminal-card overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-border bg-bg/40 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-glow-success" />
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-text">
                                Open Positions <span className="text-muted font-normal ml-1 font-num">({activePositions.length})</span>
                            </h3>
                        </div>
                        {priceSyncing && <span className="text-[9px] text-muted animate-pulse">Syncing prices…</span>}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap min-w-[700px]">
                            <thead className="bg-bg/80 text-muted border-b border-border">
                                <tr>
                                    <th className={thClass}>Algorithm</th>
                                    <th className={thClass}>Exchange</th>
                                    <th className={thClass}>Symbol</th>
                                    <th className={thClass}>Side</th>
                                    <th className={`${thClass} text-right`}>Entry</th>
                                    <th className={`${thClass} text-right`}>Size</th>
                                    <th className={`${thClass} text-right`}>Unreal. PNL</th>
                                    <th className={`${thClass} text-right`}>Unreal. %</th>
                                    <th className={`${thClass} text-right`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-[11px]">
                                {activePositions.map(pos => {
                                    const pnl = getLivePnl(pos);
                                    const hasPrice = !!livePrices[pos.symbol];
                                    return (
                                        <tr key={pos.id} className="border-b border-border/40 hover:bg-text/[0.03] transition-colors">
                                            <td className="px-4 py-3 font-bold text-text">
                                                <span className="align-middle">{pos.bot_name}</span>
                                                <Badge variant={MODE_BADGE_VARIANT[pos.mode] || 'neutral'} className="ml-2 text-[8px]!">{pos.mode}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-accent font-bold uppercase text-[10px]">{pos.exchange || 'okx'}</td>
                                            <td className="px-4 py-3 font-bold text-text font-num">{pos.symbol}</td>
                                            <td className="px-4 py-3">
                                                <Badge variant={pos.side === 'long' ? 'success' : 'danger'} className="text-[9px]!">{pos.side}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right font-num text-muted">${safeNum(pos.entry_price)}</td>
                                            <td className="px-4 py-3 text-right font-num text-muted">{formatCrypto(pos.amount)}</td>
                                            <td className={`px-4 py-3 text-right font-num font-bold ${hasPrice ? pnlColor(pnl.abs) : 'text-muted'}`}>
                                                {hasPrice ? `${pnl.abs >= 0 ? '+' : '-'}$${safeNum(Math.abs(pnl.abs))}` : '—'}
                                            </td>
                                            <td className={`px-4 py-3 text-right font-num font-bold ${hasPrice ? pnlColor(pnl.pct) : 'text-muted'}`}>
                                                {hasPrice ? `${pnlSign(pnl.pct)}${safeNum(pnl.pct, 2)}%` : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex items-center gap-2">
                                                    <Button variant="secondary" size="sm" loading={closingId === pos.id} disabled={busyAction && closingId !== pos.id} onClick={() => forceClosePosition(pos.id)}>Close</Button>
                                                    <Button variant="ghost" size="sm" disabled={busyAction} onClick={() => deleteHistoricalTrade(pos.id)} className="hover:text-danger!">Drop</Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── TABS ───────────────────────────────────────────────────────── */}
            <div className="flex space-x-8 border-b border-border">
                <button onClick={() => { setActiveTab('positions'); resetPage(); }} className={tabClass(activeTab === 'positions')}>
                    Historical Ledger
                    {closedPositions.length > 0 && <span className="ml-2 bg-raised border border-border text-muted px-1.5 py-0.5 rounded text-[8px] font-num">{closedPositions.length}</span>}
                </button>
                <button onClick={() => { setActiveTab('orders'); resetPage(); }} className={tabClass(activeTab === 'orders')}>
                    Execution Log
                    {filteredOrders.length > 0 && <span className="ml-2 bg-raised border border-border text-muted px-1.5 py-0.5 rounded text-[8px] font-num">{filteredOrders.length}</span>}
                </button>
            </div>

            {/* ── HISTORICAL LEDGER ──────────────────────────────────────────── */}
            {activeTab === 'positions' && (
                <div className="terminal-card overflow-hidden flex flex-col h-[560px]">
                    <div className="px-5 py-3 border-b border-border bg-bg/40 flex flex-wrap gap-y-2 items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-text">Historical Ledger</h3>
                            <PaginationBar
                                total={totalPagesPos}
                                current={currentPage}
                                onPrev={() => setCurrentPage(p => p - 1)}
                                onNext={() => setCurrentPage(p => p + 1)}
                            />
                        </div>
                        <Button variant="danger" size="sm" onClick={bulkDelete} disabled={closedPositions.length === 0 || busyAction}>
                            Wipe Filtered
                        </Button>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
                        {initialLoading ? (
                            <div className="p-5 space-y-2.5">
                                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                            </div>
                        ) : closedPositions.length === 0 ? (
                            <EmptyState
                                title="No historical trades"
                                description="No closed trades match your current filters. Adjust the filters above or wait for a bot to close a position."
                            />
                        ) : (
                            <table className="w-full text-left whitespace-nowrap min-w-[860px] relative">
                                <thead className="bg-inset text-muted sticky top-0 z-10 border-b border-border">
                                    <tr>
                                        <th className={thClass}>Date Closed</th>
                                        <th className={thClass}>Algorithm</th>
                                        <th className={thClass}>Exchange</th>
                                        <th className={thClass}>Pair</th>
                                        <th className={`${thClass} text-right`}>Entry → Exit</th>
                                        <th className={`${thClass} text-right`}>Size</th>
                                        <th className={`${thClass} text-right`}>Hold</th>
                                        <th className={`${thClass} text-right`}>Yield</th>
                                        <th className={`${thClass} text-right`}>Net PNL</th>
                                        <th className={`${thClass} text-right`}>Fees</th>
                                        <th className={`${thClass} text-center`}></th>
                                    </tr>
                                </thead>
                                <tbody className="text-[11px]">
                                    {renderedPositions.map(pos => {
                                        const isWin = (pos.profit_abs || 0) >= 0;
                                        const exitPrice = getExitPrice(pos);
                                        const holdMs = (() => {
                                            if (!pos.closed_at) return 0;
                                            const closedTs = new Date(pos.closed_at);
                                            if (pos.created_at) {
                                                const d = closedTs - new Date(pos.created_at);
                                                if (d > 0) return d;
                                            }
                                            const entryTs = entryTsByPos[pos.id];
                                            return (entryTs && closedTs > entryTs) ? closedTs - entryTs : 0;
                                        })();
                                        const posFees = feesByPosId[pos.id] || 0;
                                        return (
                                            <tr key={pos.id} className="border-b border-border/40 hover:bg-text/[0.03] transition-colors group">
                                                <td className="px-4 py-2.5 font-num text-muted text-[10px]">
                                                    {pos.closed_at ? new Date(pos.closed_at).toLocaleString() : '—'}
                                                </td>
                                                <td className="px-4 py-2.5 font-bold text-text">
                                                    <span className="align-middle">{pos.bot_name}</span>
                                                    <Badge variant={MODE_BADGE_VARIANT[pos.mode] || 'neutral'} className="ml-1.5 text-[8px]!">{pos.mode}</Badge>
                                                </td>
                                                <td className="px-4 py-2.5 text-accent font-bold uppercase text-[10px]">{pos.exchange || 'okx'}</td>
                                                <td className="px-4 py-2.5 font-bold font-num text-text">{pos.symbol}</td>
                                                <td className="px-4 py-2.5 text-right font-num text-[10px]">
                                                    <span className="text-muted">${safeNum(pos.entry_price)}</span>
                                                    <span className="text-faint mx-1">→</span>
                                                    <span className={exitPrice ? pnlColor(pos.profit_abs) : 'text-muted'}>
                                                        {exitPrice ? `$${safeNum(exitPrice)}` : '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-num text-muted text-[10px]">{formatCrypto(pos.amount)}</td>
                                                <td className="px-4 py-2.5 text-right font-num text-muted text-[10px]">{formatHoldTime(holdMs)}</td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-num ${isWin ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                                                        {pnlSign(pos.profit_pct)}{safeNum(pos.profit_pct)}%
                                                    </span>
                                                </td>
                                                <td className={`px-4 py-2.5 text-right font-num font-bold ${pnlColor(pos.profit_abs)}`}>
                                                    {(pos.profit_abs || 0) >= 0 ? '+' : '-'}${safeNum(Math.abs(pos.profit_abs || 0))}
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-num text-muted text-[10px]">
                                                    {posFees > 0 ? `-$${safeNum(posFees, 4)}` : '—'}
                                                </td>
                                                <td className="px-4 py-2.5 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => deleteHistoricalTrade(pos.id)} className="text-muted hover:text-danger transition-colors font-bold text-xs" aria-label="Delete trade">✕</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ── EXECUTION LOG ──────────────────────────────────────────────── */}
            {activeTab === 'orders' && (
                <div className="terminal-card overflow-hidden flex flex-col h-[560px]">
                    <div className="px-5 py-3 border-b border-border bg-bg/40 flex flex-wrap gap-y-2 items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-text">Execution Log</h3>
                                <p className="text-[9px] text-muted mt-0.5 tracking-wide">Every order dispatched to exchange or simulator</p>
                            </div>
                            <PaginationBar
                                total={totalPagesOrd}
                                current={currentPage}
                                onPrev={() => setCurrentPage(p => p - 1)}
                                onNext={() => setCurrentPage(p => p + 1)}
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
                        {initialLoading ? (
                            <div className="p-5 space-y-2.5">
                                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                            </div>
                        ) : filteredOrders.length === 0 ? (
                            <EmptyState
                                title="No orders logged"
                                description="No orders match your current filters. Orders appear here as soon as a bot dispatches one to the exchange or simulator."
                            />
                        ) : (
                            <table className="w-full text-left whitespace-nowrap min-w-[800px] relative">
                                <thead className="bg-inset text-muted sticky top-0 z-10 border-b border-border">
                                    <tr>
                                        <th className={thClass}>Timestamp</th>
                                        <th className={thClass}>Algorithm</th>
                                        <th className={thClass}>Exchange</th>
                                        <th className={thClass}>Pair</th>
                                        <th className={thClass}>Action</th>
                                        <th className={`${thClass} text-right`}>Fill Price</th>
                                        <th className={`${thClass} text-right`}>Size</th>
                                        <th className={`${thClass} text-right`}>Fee</th>
                                        <th className={`${thClass} text-right`}>Status</th>
                                    </tr>
                                </thead>
                                <tbody className="text-[11px]">
                                    {renderedOrders.map(order => (
                                        <tr key={order.id} className="border-b border-border/40 hover:bg-text/[0.03] transition-colors">
                                            <td className="px-4 py-2.5 font-num text-muted text-[10px]">{new Date(order.timestamp).toLocaleString()}</td>
                                            <td className="px-4 py-2.5 font-bold text-text">
                                                <span className="align-middle">{order.bot_name}</span>
                                                <Badge variant={MODE_BADGE_VARIANT[order.mode] || 'neutral'} className="ml-1.5 text-[8px]!">{order.mode}</Badge>
                                            </td>
                                            <td className="px-4 py-2.5 text-accent font-bold uppercase text-[10px]">{order.exchange || 'okx'}</td>
                                            <td className="px-4 py-2.5 font-bold font-num text-text">{order.symbol}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`font-bold uppercase text-[10px] ${order.side === 'buy' ? 'text-success' : 'text-danger'}`}>
                                                    {order.side}
                                                </span>
                                                <span className="ml-1.5 text-muted text-[9px] uppercase">{order.order_type}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-num text-text">${safeNum(order.price)}</td>
                                            <td className="px-4 py-2.5 text-right font-num text-muted">{formatCrypto(order.amount)}</td>
                                            <td className="px-4 py-2.5 text-right font-num text-muted text-[10px]">
                                                {order.fee > 0 ? `-$${safeNum(order.fee, 4)}` : '—'}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <Badge
                                                    variant={order.status === 'filled' ? 'success' : (order.status === 'rejected' || order.status === 'canceled') ? 'danger' : 'accent'}
                                                    className="text-[8px]!">
                                                    {order.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </PageShell>
    );
}
