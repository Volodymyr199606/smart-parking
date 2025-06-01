'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';




export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [showPopup, setShowPopup] = useState(false);
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);
    const [showForgotPopup, setShowForgotPopup] = useState(false);



    const validateEmail = (value: string) => {
        if (!value.includes('@')) {
            setEmailError("Email must include '@'");
        } else {
            setEmailError('');
        }
    };

    const validatePassword = (value: string) => {
        const hasLetter = /[a-zA-Z]/.test(value);
        const hasNumber = /[0-9]/.test(value);
        const hasSymbol = /[^a-zA-Z0-9]/.test(value);
        if (value.length < 6 || !hasLetter || !hasNumber || !hasSymbol) {
            setPasswordError("Password must be at least 6 characters and include letters, numbers, and symbols");
        } else {
            setPasswordError('');
        }
    };



    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        validateEmail(email);
        validatePassword(password);
        if (emailError || passwordError) return;

        try {
            const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
                email,
                password,
            });

            localStorage.setItem('token', response.data.token);
            setShowPopup(true);

            setTimeout(() => {
                router.push('/map');
            }, 2000);
        } catch (error: any) {
            console.error('Login failed:', error);
            setEmailError('Invalid email or user not registered');
            setPasswordError('Check your credentials and try again');
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
                            <h1 className="text-3xl font-light text-slate-900 mb-2">Welcome back</h1>
                            <p className="text-slate-600">Sign in to your account</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
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
                                    className={`w-full p-4 border ${
                                        emailError ? 'border-red-500' : 'border-slate-200'
                                    } rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors`}
                                    placeholder="you@example.com"
                                    required
                                />
                                {emailError && <p className="text-red-500 text-sm">{emailError}</p>}
                            </div>

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
                                            validatePassword(e.target.value); // optional if you validate
                                        }}
                                        className={`w-full p-4 pr-12 border ${passwordError ? 'border-red-500' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors`}
                                        placeholder="••••••••"
                                        required
                                    />

                                    {/* 👇 Forgot Password link here */}
                                    <div className="text-right mt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowForgotPopup(true);
                                                setTimeout(() => setShowForgotPopup(false), 2000);
                                            }}
                                            className="text-sm text-slate-900 hover:underline transition"
                                        >
                                            Forgot Password?
                                        </button>

                                    </div>

                                    {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}

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
                                Sign
                            </button>
                        </form>

                        <div className="text-center text-sm mt-8">
                            <p className="text-slate-600">
                                Don't have an account?{' '}
                                <a href="/register" className="text-slate-900 hover:underline font-medium">
                                    Sign up
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {showPopup && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 shadow-xl text-center animate-scale-up">
                        <p className="text-lg font-medium text-slate-800">
                            ✅ Real-time map will be available soon
                        </p>
                    </div>
                </div>
            )}

            {showForgotPopup && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 shadow-xl text-center animate-scale-up">
                        <p className="text-lg font-medium text-slate-800">
                            🔒 Password recovery feature coming soon
                        </p>
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
