'use client';
export const dynamic = "force-dynamic";

import LoginForm from '@/components/auth/login-form';

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-md">
                <LoginForm />
            </div>
        </div>
    );
}