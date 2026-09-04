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

export const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
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
            clearApiKey();
            window.dispatchEvent(new CustomEvent('api-key-invalid'));
        }
        return Promise.reject(error);
    }
);
