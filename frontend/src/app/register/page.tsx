'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerUser } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';




export default function RegisterForm() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nameError, setNameError] = useState('');
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);


    const validateName = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
            setNameError('Full name is required');
        } else if (trimmed.length < 2) {
            setNameError('Full name must be at least 2 characters');
        } else if (trimmed.length > 100) {
            setNameError('Full name must be less than 100 characters');
        } else {
            setNameError('');
        }
    };

    const validateEmail = (value: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        setEmailError(emailRegex.test(value.trim()) ? '' : 'Please enter a valid email address');
    };

    const validatePassword = (value: string) => {
        const hasLetter = /[a-zA-Z]/.test(value);
        const hasNumber = /[0-9]/.test(value);
        const hasSymbol = /[^a-zA-Z0-9]/.test(value);
        setPasswordError(
            value.length >= 6 && hasLetter && hasNumber && hasSymbol
                ? ''
                : 'Min 6 chars, include letter, number, and symbol'
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        validateName(name);
        validateEmail(email);
        validatePassword(password);

        if (nameError || emailError || passwordError) return;

        try {
            const response = await registerUser(name, email, password);
            console.log('Success:', response.data);
            setShowSuccess(true);
            setTimeout(() => {
                router.push('/login');
            }, 1500);
        } catch (error: unknown) {
            if (error && typeof error === 'object' && 'response' in error) {
                const axiosError = error as { response?: { data?: { error?: string; message?: string; fullName?: string; email?: string; password?: string } } };
                const errorData = axiosError.response?.data;
                if (errorData) {
                    // Handle validation errors from backend
                    if (errorData.fullName) {
                        setNameError(errorData.fullName);
                    }
                    if (errorData.email) {
                        setEmailError(errorData.email);
                    }
                    if (errorData.password) {
                        setPasswordError(errorData.password);
                    }
                    // Show general error message
                    const errorMessage = errorData.error || errorData.message || 'Registration failed';
                    console.error('Registration failed:', errorMessage);
                    alert(errorMessage);
                } else {
                    console.error('Registration failed:', 'Unknown error');
                }
            } else if (error instanceof Error) {
                console.error('Registration failed:', error.message);
                alert(error.message);
            }
        }

    };

    return (
        <>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 flex items-center justify-center py-12 px-6">
                <div className="w-full max-w-md mx-auto">
                    <div className="bg-white rounded-2xl shadow-soft p-8">
                        {/* Back to Home */}
                        <div className="flex items-center space-x-1 mb-6">
                            <ArrowLeft className="w-4 h-4 text-gray-600" />
                            <Link href="/" className="text-sm text-gray-600 hover:text-gray-800 transition">
                                Back to Home
                            </Link>
                        </div>

                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-light text-slate-900 mb-2">Create account</h1>
                            <p className="text-slate-600">Sign up to get started</p>
                        </div>

                        <form className="space-y-6" onSubmit={handleSubmit}>
                            {/* Full Name */}
                            <div className="space-y-2">
                                <label htmlFor="fullName" className="text-sm font-medium text-slate-700">
                                    Full Name
                                </label>
                                <input
                                    id="fullName"
                                    type="text"
                                    value={name}
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        validateName(e.target.value);
                                    }}
                                    className={`w-full p-4 bg-white text-slate-900 border ${nameError ? 'border-red-500' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors placeholder:text-slate-400`}
                                    placeholder="John Doe"
                                    required
                                />
                                {nameError && <p className="text-red-500 text-sm">{nameError}</p>}
                            </div>

                            {/* Email */}
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-sm font-medium text-slate-700">
                                    Email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        validateEmail(e.target.value);
                                    }}
                                    className={`w-full p-4 bg-white text-slate-900 border ${emailError ? 'border-red-500' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors placeholder:text-slate-400`}
                                    placeholder="you@example.com"
                                    required
                                />
                                {emailError && <p className="text-red-500 text-sm">{emailError}</p>}
                            </div>

                            {/* Password */}
                            <div className="space-y-2">
                                <label htmlFor="password" className="text-sm font-medium text-slate-700">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            validatePassword(e.target.value);
                                        }}
                                        className={`w-full p-4 pr-12 bg-white text-slate-900 border ${passwordError ? 'border-red-500' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors placeholder:text-slate-400`}
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-4 text-gray-500 hover:text-gray-700 focus:outline-none"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                                {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}
                            </div>


                            <button
                                type="submit"
                                className="w-full bg-slate-900 text-white hover:bg-slate-800 py-4 rounded-xl font-medium transition-all duration-300 hover:scale-105"
                            >
                                Sign up
                            </button>
                        </form>

                        <div className="text-center text-sm mt-8">
                            <p className="text-slate-600">
                                Already have an account?{' '}
                                <a href="/login" className="text-slate-900 hover:underline font-medium">
                                    Sign in
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {showSuccess && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 shadow-xl text-center animate-scale-up">
                        <div className="flex items-center justify-center mb-4">
                            <svg className="w-16 h-16 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="text-lg font-medium text-slate-800">Registration Successful!</p>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes scale-up {
                    0% {
                        transform: scale(0.8);
                        opacity: 0;
                    }
                    100% {
                        transform: scale(1);
                        opacity: 1;
                    }
                }
                .animate-scale-up {
                    animation: scale-up 0.3s ease-out;
                }
            `}</style>
        </>
    );
}
