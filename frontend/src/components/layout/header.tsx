"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Menu, X, LogOut } from "lucide-react"

export default function Header() {
    const { user, isAuthenticated, logout } = useAuth()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const pathname = usePathname()

    const isActive = (path: string) => pathname === path

    const toggleMobileMenu = () => {
        setMobileMenuOpen(!mobileMenuOpen)
    }

    return (
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-6">
                <div className="flex justify-between h-20">
                    <div className="flex items-center">
                        <Link href={isAuthenticated ? "/dashboard" : "/"} className="text-2xl font-medium text-slate-900">
                            ParkFinder
                        </Link>
                    </div>

                    {/* Desktop navigation */}
                    {isAuthenticated && (
                        <nav className="hidden md:flex items-center space-x-8">
                            <Link
                                href="/dashboard"
                                className={`text-sm font-medium transition-colors ${
                                    isActive("/dashboard") ? "text-slate-900" : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                Dashboard
                            </Link>
                            <Link
                                href="/map"
                                className={`text-sm font-medium transition-colors ${
                                    isActive("/map") ? "text-slate-900" : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                Map
                            </Link>
                            <Link
                                href="/favorites"
                                className={`text-sm font-medium transition-colors ${
                                    isActive("/favorites") ? "text-slate-900" : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                Favorites
                            </Link>
                        </nav>
                    )}

                    {/* User menu */}
                    <div className="hidden md:flex items-center space-x-4">
                        {isAuthenticated ? (
                            <div className="flex items-center space-x-4">
                                <span className="text-sm text-slate-700">{user?.fullName}</span>
                                <button
                                    onClick={logout}
                                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
                                >
                                    <LogOut size={18} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <Link
                                    href="/login"
                                    className="text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors"
                                >
                                    Sign in
                                </Link>
                                <Link
                                    href="/register"
                                    className="bg-slate-900 text-white hover:bg-slate-800 px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 hover:scale-105"
                                >
                                    Sign up
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Mobile menu button */}
                    <div className="flex items-center md:hidden">
                        <button
                            onClick={toggleMobileMenu}
                            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile menu */}
            {mobileMenuOpen && (
                <div className="md:hidden bg-white/95 backdrop-blur-md border-t border-slate-200/50">
                    <div className="px-6 py-4 space-y-3">
                        {isAuthenticated ? (
                            <>
                                <Link
                                    href="/dashboard"
                                    className={`block py-2 text-base font-medium transition-colors ${
                                        isActive("/dashboard") ? "text-slate-900" : "text-slate-600 hover:text-slate-900"
                                    }`}
                                    onClick={toggleMobileMenu}
                                >
                                    Dashboard
                                </Link>
                                <Link
                                    href="/map"
                                    className={`block py-2 text-base font-medium transition-colors ${
                                        isActive("/map") ? "text-slate-900" : "text-slate-600 hover:text-slate-900"
                                    }`}
                                    onClick={toggleMobileMenu}
                                >
                                    Map
                                </Link>
                                <Link
                                    href="/favorites"
                                    className={`block py-2 text-base font-medium transition-colors ${
                                        isActive("/favorites") ? "text-slate-900" : "text-slate-600 hover:text-slate-900"
                                    }`}
                                    onClick={toggleMobileMenu}
                                >
                                    Favorites
                                </Link>
                                <div className="pt-4 border-t border-slate-200">
                                    <p className="text-sm text-slate-600 mb-2">{user?.fullName}</p>
                                    <button
                                        onClick={() => {
                                            logout()
                                            toggleMobileMenu()
                                        }}
                                        className="text-slate-600 hover:text-slate-900 text-base font-medium transition-colors"
                                    >
                                        Sign out
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Link
                                    href="/login"
                                    className="block py-2 text-slate-600 hover:text-slate-900 text-base font-medium transition-colors"
                                    onClick={toggleMobileMenu}
                                >
                                    Sign in
                                </Link>
                                <Link
                                    href="/register"
                                    className="block mt-2 bg-slate-900 text-white text-center py-3 rounded-full text-base font-medium transition-colors"
                                    onClick={toggleMobileMenu}
                                >
                                    Sign up
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            )}
        </header>
    )
}
