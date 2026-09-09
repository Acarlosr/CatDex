// Indicator palette, loaded once from the backend registry (GET /api/indicators).
// The backend (backend/engine/indicator_registry.py) is the single source of
// truth for names, params, output order and chart pane; nothing indicator-
// specific is hard-coded here.
//
// Shape of each entry:
//   { method, label, category, pane: 'overlay'|'oscillator'|'volume',
//     outputs: [label, ...] (index == output_idx), params: [{id,label,default}],
//     disabled_outputs: [idx, ...] }
import { useEffect, useSyncExternalStore } from 'react';
import { apiClient } from '../../api/client';

let registryCache = null;      // { categories, indicators, byMethod, groups }
let lastError = null;
let inflight = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

function shape(payload) {
    const byMethod = {};
    const groups = {};
    for (const cat of payload.categories) groups[cat] = [];
    for (const ind of payload.indicators) {
        byMethod[ind.method] = ind;
        (groups[ind.category] ||= []).push(ind);
    }
    return { categories: payload.categories, indicators: payload.indicators, byMethod, groups };
}

/** Fetches the registry once; concurrent callers share the request. Failed loads are not cached. */
export function loadIndicators() {
    if (registryCache) return Promise.resolve(registryCache);
    if (!inflight) {
        inflight = apiClient.get('/api/indicators')
            .then((res) => {
                registryCache = shape(res.data);
                lastError = null;
                return registryCache;
            })
            .catch((err) => { lastError = err; throw err; })
            .finally(() => { inflight = null; notify(); });
    }
    return inflight;
}

/** Synchronous access after loadIndicators() resolved; null before that. */
export function getIndicatorRegistry() {
    return registryCache;
}

/** Chart pane for a method ('overlay' | 'oscillator' | 'volume'); null when unknown or not loaded. */
export function getIndicatorPane(method) {
    return registryCache?.byMethod[String(method || '').toLowerCase()]?.pane ?? null;
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** React hook: { registry, error }. `registry` is null until loaded. */
export function useIndicators() {
    const registry = useSyncExternalStore(subscribe, () => registryCache);
    const error = useSyncExternalStore(subscribe, () => lastError);
    useEffect(() => { if (!registryCache) loadIndicators().catch(() => {}); }, []);
    return { registry, error };
}
