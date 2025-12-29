'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { jwtDecode } from 'jwt-decode';

interface User {
    email: string;
    fullName: string;
    roles: string[];
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (fullName: string, email: string, password: string) => Promise<void>;
    logout: () => void;
    setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Check if user is logged in
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            try {
                const decoded = jwtDecode<{ sub: string; exp: number }>(storedToken);
                const currentTime = Date.now() / 1000;

                if (decoded.exp > currentTime) {
                    setToken(storedToken);
                    // ✅ UPDATED: Fetch user data from AuthController
                    api.get('/auth/me')
                        .then(response => {
                            setUser(response.data);
                        })
                        .catch(error => {
                            console.error('Error fetching user data:', error);
                            localStorage.removeItem('token');
                        })
                        .finally(() => {
                            setIsLoading(false);
                        });
                } else {
                    // Token expired
                    localStorage.removeItem('token');
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('Invalid token:', error);
                localStorage.removeItem('token');
                setIsLoading(false);
            }
        } else {
            setIsLoading(false);
        }
    }, []);

    const login = async (email: string, password: string) => {
        try {
            const response = await api.post('/auth/login', { email, password });
            const { token, email: userEmail, fullName, roles } = response.data;

            localStorage.setItem('token', token);
            setToken(token);
            setUser({ email: userEmail, fullName, roles });
            router.push('/dashboard');
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    };

    const register = async (fullName: string, email: string, password: string) => {
        try {
            const response = await api.post('/auth/register', { fullName, email, password });
            const { token, email: userEmail, fullName: userName, roles } = response.data;

            localStorage.setItem('token', token);
            setToken(token);
            setUser({ email: userEmail, fullName: userName, roles });
            router.push('/dashboard');
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        setToken(null);
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isAuthenticated: !!user,
            isLoading,
            login,
            register,
            logout,
            setUser
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}