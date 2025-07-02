'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface FormErrors {
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
}

interface FormData {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
}

const RegisterForm: React.FC = () => {
    const router = useRouter();
    const [formData, setFormData] = useState<FormData>({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
    });

    const [errors, setErrors] = useState<FormErrors>({});
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    const validateField = (name: string, value: string): string | undefined => {
        switch (name) {
            case 'fullName':
                if (!value.trim()) return 'Full name is required';
                if (value.trim().length < 2) return 'Full name must be at least 2 characters';
                if (!/^[a-zA-Z\s]+$/.test(value.trim()))
                    return 'Full name can only contain letters and spaces';
                return;
            case 'email':
                if (!value.trim()) return 'Email is required';
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value.trim())) return 'Please enter a valid email address';
                return;
            case 'password':
                if (!value) return 'Password is required';
                if (value.length < 8) return 'Password must be at least 8 characters';
                if (!/(?=.*[a-z])/.test(value)) return 'Must contain at least one lowercase letter';
                if (!/(?=.*[A-Z])/.test(value)) return 'Must contain at least one uppercase letter';
                if (!/(?=.*\d)/.test(value)) return 'Must contain at least one number';
                return;
            case 'confirmPassword':
                if (!value) return 'Please confirm your password';
                if (value !== formData.password) return 'Passwords do not match';
                return;
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));

        if (submitError) setSubmitError(null);
        const error = validateField(name, value);
        setErrors((prev) => ({ ...prev, [name]: error }));

        if (name === 'password' && formData.confirmPassword) {
            const confirmError = validateField('confirmPassword', formData.confirmPassword);
            setErrors((prev) => ({ ...prev, confirmPassword: confirmError }));
        }
    };

    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};
        Object.keys(formData).forEach((key) => {
            const error = validateField(key, formData[key as keyof FormData]);
            if (error) newErrors[key as keyof FormErrors] = error;
        });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const getFieldStatus = (field: keyof FormData) => {
        const value = formData[field];
        const error = errors[field];
        if (!value) return 'default';
        return error ? 'error' : 'success';
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitError(null);
        setSubmitSuccess(false);

        if (!validateForm()) {
            setSubmitError('Please fix the errors above before submitting.');
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch(`https://smart-parking-zwyo.onrender.com/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: formData.fullName,
                    email: formData.email,
                    password: formData.password,
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Registration failed');

            setSubmitSuccess(true);
            if (data.token) localStorage.setItem('token', data.token);

            setTimeout(() => router.push('/dashboard'), 1500);
        } catch (err: unknown) {
            setSubmitError(err instanceof Error ? err.message : 'Registration failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-soft p-8">
            <h1 className="text-3xl font-light text-slate-900 mb-2 text-center">Create account</h1>
            <p className="text-center text-slate-600 mb-6">Join ParkFinder to start finding parking spots</p>

            {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm mb-6 flex items-center">
                    <XCircle size={16} className="mr-2" />
                    {submitError}
                </div>
            )}
            {submitSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-600 p-4 rounded-xl text-sm mb-6 flex items-center">
                    <CheckCircle size={16} className="mr-2" />
                    Account created successfully! Redirecting...
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {['fullName', 'email', 'password', 'confirmPassword'].map((field) => (
                    <div key={field} className="space-y-2">
                        <label htmlFor={field} className="text-sm font-medium text-slate-700 capitalize">
                            {field === 'confirmPassword' ? 'Confirm Password' : field.replace(/([A-Z])/g, ' $1')} *
                        </label>
                        <div className="relative">
                            <input
                                id={field}
                                name={field}
                                type={
                                    field.toLowerCase().includes('password')
                                        ? field === 'confirmPassword'
                                            ? showConfirmPassword
                                                ? 'text'
                                                : 'password'
                                            : showPassword
                                                ? 'text'
                                                : 'password'
                                        : 'text'
                                }
                                value={formData[field as keyof FormData]}
                                onChange={handleInputChange}
                                className={`w-full p-4 border rounded-xl transition-colors ${
                                    getFieldStatus(field as keyof FormData) === 'error'
                                        ? 'border-red-300'
                                        : getFieldStatus(field as keyof FormData) === 'success'
                                            ? 'border-green-300'
                                            : 'border-slate-200'
                                }`}
                                placeholder={`Enter your ${field}`}
                                disabled={isLoading}
                                required
                            />
                            {field.toLowerCase().includes('password') && (
                                <button
                                    type="button"
                                    className="absolute right-4 top-4 text-gray-500"
                                    onClick={() =>
                                        field === 'password'
                                            ? setShowPassword(!showPassword)
                                            : setShowConfirmPassword(!showConfirmPassword)
                                    }
                                >
                                    {((field === 'password' && showPassword) ||
                                        (field === 'confirmPassword' && showConfirmPassword)) ? (
                                        <EyeOff size={20} />
                                    ) : (
                                        <Eye size={20} />
                                    )}
                                </button>
                            )}
                        </div>
                        {errors[field as keyof FormErrors] && (
                            <p className="text-red-500 text-sm">{errors[field as keyof FormErrors]}</p>
                        )}
                    </div>
                ))}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-slate-900 text-white hover:bg-slate-800 py-4 rounded-xl font-medium transition-all duration-300 hover:scale-105 disabled:opacity-50"
                >
                    {isLoading ? (
                        <span className="flex items-center justify-center">
              <Loader2 size={20} className="animate-spin mr-2" />
              Creating account...
            </span>
                    ) : (
                        'Create Account'
                    )}
                </button>
            </form>

            <div className="text-center text-sm mt-8">
                <p className="text-slate-600">
                    Already have an account?{' '}
                    <Link href="/login" className="text-slate-900 hover:underline font-medium">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default RegisterForm;
