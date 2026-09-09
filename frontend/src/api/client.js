import axios from 'axios';

// Pre-cookie versions kept the master key here. It is migrated to a session
// cookie once (see migrateLegacyKey) and never written again.
const LEGACY_KEY_STORAGE = 'apex_api_key';

// Empty string = relative URLs, i.e. same origin as the frontend (nginx/vite proxy).
// Set VITE_API_BASE_URL only when the API lives on a different origin.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
});

const AUTH_PATHS = ['/api/auth/login', '/api/auth/me', '/api/auth/logout'];

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const url = error.config?.url || '';
        // Auth endpoints handle their own 401s (gate + session probe); for any
        // other call an auth error means the session cookie is gone or stale.
        if ((status === 401 || status === 403) && !AUTH_PATHS.some((p) => url.endsWith(p))) {
            window.dispatchEvent(new CustomEvent('api-key-invalid', { detail: { reason: 'expired' } }));
        }
        return Promise.reject(error);
    }
);

export async function login(apiKey) {
    await apiClient.post('/api/auth/login', { api_key: apiKey });
}

export async function logout() {
    try {
        await apiClient.post('/api/auth/logout');
    } catch {
        // Cookie is cleared server-side on success; on failure the gate is shown anyway.
    }
}

/** true = valid session, false = not logged in. Throws on network errors. */
export async function checkSession() {
    try {
        await apiClient.get('/api/auth/me');
        return true;
    } catch (err) {
        const status = err.response?.status;
        if (status === 401 || status === 403) return false;
        throw err;
    }
}

/**
 * One-time migration: a key left in localStorage by an older version is
 * exchanged for a session cookie, then removed regardless of the outcome.
 */
export async function migrateLegacyKey() {
    const key = localStorage.getItem(LEGACY_KEY_STORAGE);
    if (!key) return false;
    localStorage.removeItem(LEGACY_KEY_STORAGE);
    try {
        await login(key);
        return true;
    } catch {
        return false;
    }
}
