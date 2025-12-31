import axios from 'axios';

// Default to localhost:8080 for local development if env var is not set
const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const api = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 10000, // 10 second timeout to prevent hanging
});

// Add a request interceptor to include the JWT token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Add a response interceptor to handle token expiration
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Don't redirect on /api/auth/me errors - let the auth context handle it
        const isAuthMeRequest = originalRequest?.url?.includes('/api/auth/me');

        // If the error is 401 and we haven't retried yet
        if (error.response && error.response.status === 401 && !originalRequest._retry && !isAuthMeRequest) {
            originalRequest._retry = true;

            // Redirect to login page (but not for /api/auth/me which is checked on app load)
            if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
                window.location.href = '/login';
            }
        }

        return Promise.reject(error);
    }
);

export default api;