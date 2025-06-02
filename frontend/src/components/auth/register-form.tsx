"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react"

interface FormErrors {
    fullName?: string
    email?: string
    password?: string
    confirmPassword?: string
}

interface FormData {
    fullName: string
    email: string
    password: string
    confirmPassword: string
}

export default function RegisterForm() {
    const router = useRouter()
    const [formData, setFormData] = useState<FormData>({
        fullName: "",
        email: "",
        password: "",
        confirmPassword: "",
    })
    const [errors, setErrors] = useState<FormErrors>({})
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitSuccess, setSubmitSuccess] = useState(false)

    // Check if full name has invalid characters (numbers or special chars)
    const hasInvalidNameChars = (name: string): boolean => {
        if (!name) return false
        // Check for any character that is NOT a letter or space
        return /[^a-zA-Z\s]/.test(name)
    }

    // Real-time validation
    const validateField = (name: string, value: string): string | undefined => {
        switch (name) {
            case "fullName":
                if (!value.trim()) return "Full name is required"
                if (value.trim().length < 2) return "Full name must be at least 2 characters"
                if (!/^[a-zA-Z\s]+$/.test(value.trim())) return "Full name can only contain letters and spaces"
                return undefined

            case "email":
                if (!value.trim()) return "Email is required"
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                if (!emailRegex.test(value.trim())) return "Please enter a valid email address"
                return undefined

            case "password":
                if (!value) return "Password is required"
                if (value.length < 8) return "Password must be at least 8 characters"
                if (!/(?=.*[a-z])/.test(value)) return "Password must contain at least one lowercase letter"
                if (!/(?=.*[A-Z])/.test(value)) return "Password must contain at least one uppercase letter"
                if (!/(?=.*\d)/.test(value)) return "Password must contain at least one number"
                return undefined

            case "confirmPassword":
                if (!value) return "Please confirm your password"
                if (value !== formData.password) return "Passwords do not match"
                return undefined

            default:
                return undefined
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target

        // Update form data
        setFormData((prev) => ({ ...prev, [name]: value }))

        // Clear submit error when user starts typing
        if (submitError) setSubmitError(null)

        // Real-time validation
        const error = validateField(name, value)
        setErrors((prev) => ({ ...prev, [name]: error }))

        // Also validate confirm password if password changes
        if (name === "password" && formData.confirmPassword) {
            const confirmError = validateField("confirmPassword", formData.confirmPassword)
            setErrors((prev) => ({ ...prev, confirmPassword: confirmError }))
        }
    }

    const validateForm = (): boolean => {
        const newErrors: FormErrors = {}

        Object.keys(formData).forEach((key) => {
            const error = validateField(key, formData[key as keyof FormData])
            if (error) newErrors[key as keyof FormErrors] = error
        })

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitError(null)
        setSubmitSuccess(false)

        if (!validateForm()) {
            setSubmitError("Please fix the errors above before submitting.")
            return
        }

        setIsLoading(true)

        try {
            console.log("Submitting to Spring Boot backend:", `${process.env.NEXT_PUBLIC_API_URL}/auth/register`)

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    fullName: formData.fullName.trim(),
                    email: formData.email.trim().toLowerCase(),
                    password: formData.password,
                }),
            })

            console.log("Response status:", response.status)
            const data = await response.json()
            console.log("Response data:", data)

            if (!response.ok) {
                throw new Error(data.message || "Registration failed")
            }

            setSubmitSuccess(true)

            // Store token if provided
            if (data.token) {
                localStorage.setItem("token", data.token)
            }

            // Redirect to dashboard after short delay
            setTimeout(() => {
                router.push("/dashboard")
            }, 1500)
        } catch (err: any) {
            console.error("Registration error:", err)
            setSubmitError(err.message || "Registration failed. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }

    const getFieldStatus = (fieldName: keyof FormErrors) => {
        const value = formData[fieldName]
        const error = errors[fieldName]

        if (!value) return "default"
        if (error) return "error"
        return "success"
    }

    return (
        <div className="w-full max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-soft p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-light text-slate-900 mb-2">Create account</h1>
                    <p className="text-slate-600">Join ParkFinder to start finding parking spots</p>
                </div>

                {submitError && (
                    <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm mb-6 flex items-center">
                        <XCircle size={16} className="mr-2 flex-shrink-0" />
                        {submitError}
                    </div>
                )}

                {submitSuccess && (
                    <div className="bg-green-50 border border-green-200 text-green-600 p-4 rounded-xl text-sm mb-6 flex items-center">
                        <CheckCircle size={16} className="mr-2 flex-shrink-0" />
                        Account created successfully! Redirecting to dashboard...
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Full Name */}
                    <div className="space-y-2">
                        <label htmlFor="fullName" className="text-sm font-medium text-slate-700">
                            Full Name *
                        </label>
                        <div className="relative">
                            <input
                                id="fullName"
                                name="fullName"
                                type="text"
                                value={formData.fullName}
                                onChange={handleInputChange}
                                className={`w-full p-4 border rounded-xl transition-colors pr-12 ${
                                    hasInvalidNameChars(formData.fullName)
                                        ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                                        : getFieldStatus("fullName") === "success"
                                            ? "border-green-300 focus:ring-green-500 focus:border-green-500"
                                            : "border-slate-200 focus:ring-slate-900 focus:border-slate-900"
                                }`}
                                placeholder="John Doe"
                                disabled={isLoading}
                                required
                            />
                            {getFieldStatus("fullName") === "success" && !hasInvalidNameChars(formData.fullName) && (
                                <CheckCircle size={20} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-green-500" />
                            )}
                            {hasInvalidNameChars(formData.fullName) && (
                                <XCircle size={20} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-red-500" />
                            )}
                        </div>

                        {/* ORANGE WARNING BOX - Shows immediately when invalid chars are typed */}
                        {formData.fullName && hasInvalidNameChars(formData.fullName) && (
                            <div className="bg-orange-100 border border-orange-300 rounded-md px-3 py-2 text-sm text-orange-800 flex items-center">
                                <div className="bg-orange-500 text-white rounded-sm w-4 h-4 flex items-center justify-center text-xs font-bold mr-2 flex-shrink-0">
                                    !
                                </div>
                                <span>
                  Please use only letters and spaces in the full name field. Numbers and special characters are not
                  allowed.
                </span>
                            </div>
                        )}

                        {errors.fullName && !hasInvalidNameChars(formData.fullName) && (
                            <p className="text-red-600 text-sm">{errors.fullName}</p>
                        )}
                        <div className="text-xs text-slate-500">Please enter only letters and spaces (e.g., John Doe)</div>
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                        <label htmlFor="email" className="text-sm font-medium text-slate-700">
                            Email Address *
                        </label>
                        <div className="relative">
                            <input
                                id="email"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                className={`w-full p-4 border rounded-xl transition-colors pr-12 ${
                                    getFieldStatus("email") === "error"
                                        ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                                        : getFieldStatus("email") === "success"
                                            ? "border-green-300 focus:ring-green-500 focus:border-green-500"
                                            : "border-slate-200 focus:ring-slate-900 focus:border-slate-900"
                                }`}
                                placeholder="you@example.com"
                                disabled={isLoading}
                                required
                            />
                            {getFieldStatus("email") === "success" && (
                                <CheckCircle size={20} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-green-500" />
                            )}
                            {getFieldStatus("email") === "error" && (
                                <XCircle size={20} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-red-500" />
                            )}
                        </div>
                        {errors.email && <p className="text-red-600 text-sm">{errors.email}</p>}
                        <div className="text-xs text-slate-500">Please enter a valid email address (e.g., john@example.com)</div>
                    </div>

                    {/* Password */}
                    <div className="space-y-2">
                        <label htmlFor="password" className="text-sm font-medium text-slate-700">
                            Password *
                        </label>
                        <div className="relative">
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? "text" : "password"}
                                value={formData.password}
                                onChange={handleInputChange}
                                className={`w-full p-4 border rounded-xl transition-colors pr-20 ${
                                    getFieldStatus("password") === "error"
                                        ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                                        : getFieldStatus("password") === "success"
                                            ? "border-green-300 focus:ring-green-500 focus:border-green-500"
                                            : "border-slate-200 focus:ring-slate-900 focus:border-slate-900"
                                }`}
                                placeholder="••••••••"
                                disabled={isLoading}
                                required
                            />
                            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                                {getFieldStatus("password") === "success" && <CheckCircle size={20} className="text-green-500" />}
                                {getFieldStatus("password") === "error" && <XCircle size={20} className="text-red-500" />}
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>
                        {errors.password && <p className="text-red-600 text-sm">{errors.password}</p>}
                        <div className="text-xs text-slate-500">
                            Password must contain at least 8 characters with uppercase, lowercase, and numbers
                        </div>
                    </div>

                    {/* Confirm Password */}
                    <div className="space-y-2">
                        <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
                            Confirm Password *
                        </label>
                        <div className="relative">
                            <input
                                id="confirmPassword"
                                name="confirmPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                value={formData.confirmPassword}
                                onChange={handleInputChange}
                                className={`w-full p-4 border rounded-xl transition-colors pr-20 ${
                                    getFieldStatus("confirmPassword") === "error"
                                        ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                                        : getFieldStatus("confirmPassword") === "success"
                                            ? "border-green-300 focus:ring-green-500 focus:border-green-500"
                                            : "border-slate-200 focus:ring-slate-900 focus:border-slate-900"
                                }`}
                                placeholder="••••••••"
                                disabled={isLoading}
                                required
                            />
                            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                                {getFieldStatus("confirmPassword") === "success" && (
                                    <CheckCircle size={20} className="text-green-500" />
                                )}
                                {getFieldStatus("confirmPassword") === "error" && <XCircle size={20} className="text-red-500" />}
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>
                        {errors.confirmPassword && <p className="text-red-600 text-sm">{errors.confirmPassword}</p>}
                        <div className="text-xs text-slate-500">Please re-enter your password to confirm</div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !validateForm()}
                        className="w-full bg-slate-900 text-white hover:bg-slate-800 py-4 rounded-xl font-medium transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center">
                <Loader2 size={20} className="animate-spin mr-2" />
                Creating account...
              </span>
                        ) : (
                            "Create Account"
                        )}
                    </button>
                </form>

                <div className="text-center text-sm mt-8">
                    <p className="text-slate-600">
                        Already have an account?{" "}
                        <Link href="/login" className="text-slate-900 hover:underline font-medium">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
