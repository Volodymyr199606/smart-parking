"use client"

export const dynamic = "force-dynamic";

import { useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { ArrowLeft } from "lucide-react"
import UserProfile from "@/components/ui/user-profile"

export default function ProfilePage() {
    const { isAuthenticated, isLoading } = useAuth()

    useEffect(() => {
        if (isLoading) return

        if (!isAuthenticated) {
            window.location.href = "/login"
            return
        }
    }, [isAuthenticated, isLoading])

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="container mx-auto px-6 py-8">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center text-slate-600 hover:text-slate-900 mb-4 transition-colors"
                    >
                        <ArrowLeft size={20} className="mr-2" />
                        Back to Dashboard
                    </Link>
                    <h1 className="text-3xl font-light text-slate-900 mb-2">My Profile</h1>
                    <p className="text-slate-600">Manage your account settings and parking preferences</p>
                </div>

                {/* Profile Component */}
                <UserProfile />
            </div>
        </div>
    )
}
