import axios from 'axios';

const API_KEY_STORAGE = 'apex_api_key';

export function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function setApiKey(key) {
    localStorage.setItem(API_KEY_STORAGE, key);
}

export function clearApiKey() {
    localStorage.removeItem(API_KEY_STORAGE);
}

// Empty string = relative URLs, i.e. same origin as the frontend (nginx/vite proxy).
// Set VITE_API_BASE_URL only when the API lives on a different origin.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

apiClient.interceptors.request.use((config) => {
    const key = getApiKey();
    if (key) {
        config.headers['X-API-Key'] = key;
    }
    return config;
});

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
            // Only treat this as a signed-out session when a stored key was
            // invalidated (a failed unlock attempt on the gate has no stored key).
            const hadStoredKey = Boolean(getApiKey());
            clearApiKey();
            if (hadStoredKey) {
                window.dispatchEvent(new CustomEvent('api-key-invalid', { detail: { reason: 'expired' } }));
            }
        }
        return Promise.reject(error);
    }
);
