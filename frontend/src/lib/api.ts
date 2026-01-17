import axios from 'axios';

// Force localhost for local development
// Always use localhost when running on localhost (development)
const getBaseURL = () => {
    // Check if we're running on localhost
    if (typeof window !== 'undefined') {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalhost) {
            return 'http://localhost:8080';
        }
    }
    // For production builds, use environment variable
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
        console.error(
            '⚠️ NEXT_PUBLIC_API_URL environment variable is not set!\n' +
            'Please set it in your Vercel project settings:\n' +
            '1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables\n' +
            '2. Add NEXT_PUBLIC_API_URL with your backend URL (e.g., https://your-backend.onrender.com)\n' +
            '3. Redeploy your application'
        );
        // Don't return localhost - it will always fail in production
        // Instead, return null and let error handling catch it
        return null;
    }
    return apiUrl;
};

const baseURL = getBaseURL();

// Log the API URL being used
if (typeof window !== 'undefined') {
    console.log('API Base URL:', baseURL || 'NOT CONFIGURED');
    console.log('Hostname:', window.location.hostname);
}

const api = axios.create({
    baseURL: baseURL || 'http://localhost:8080', // Fallback for build-time
    headers: {
        'Content-Type': 'application/json',
    },
    // Increased timeout for production (Render free tier can take 30+ seconds on cold start)
    timeout: typeof window !== 'undefined' && window.location.hostname !== 'localhost' 
        ? 60000 // 60 seconds for production
        : 10000, // 10 seconds for localhost
});

// Add a request interceptor to include the JWT token and check API URL
api.interceptors.request.use(
    (config) => {
        // Check if API URL is configured first
        if (!baseURL) {
            return Promise.reject(new Error('API URL not configured. Please set NEXT_PUBLIC_API_URL environment variable in Vercel settings and redeploy.'));
        }
        
        // Add JWT token if available
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