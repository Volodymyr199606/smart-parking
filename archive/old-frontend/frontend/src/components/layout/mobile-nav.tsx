"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MapPin, Home, Heart, User } from "lucide-react"

export default function MobileNav() {
    const pathname = usePathname()

    const isActive = (path: string) => pathname === path

    // Don't show on auth pages
    if (pathname === "/login" || pathname === "/register" || pathname === "/") {
        return null
    }

    return (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-50">
            <div className="flex justify-around py-2">
                <Link
                    href="/dashboard"
                    className={`flex flex-col items-center py-3 px-4 rounded-xl transition-colors ${
                        isActive("/dashboard") ? "text-slate-900 bg-slate-100" : "text-slate-600"
                    }`}
                >
                    <Home size={24} />
                    <span className="text-xs mt-1 font-medium">Home</span>
                </Link>
                <Link
                    href="/map"
                    className={`flex flex-col items-center py-3 px-4 rounded-xl transition-colors ${
                        isActive("/map") ? "text-slate-900 bg-slate-100" : "text-slate-600"
                    }`}
                >
                    <MapPin size={24} />
                    <span className="text-xs mt-1 font-medium">Map</span>
                </Link>
                <Link
                    href="/favorites"
                    className={`flex flex-col items-center py-3 px-4 rounded-xl transition-colors ${
                        isActive("/favorites") ? "text-slate-900 bg-slate-100" : "text-slate-600"
                    }`}
                >
                    <Heart size={24} />
                    <span className="text-xs mt-1 font-medium">Favorites</span>
                </Link>
                <Link
                    href="/profile"
                    className={`flex flex-col items-center py-3 px-4 rounded-xl transition-colors ${
                        isActive("/profile") ? "text-slate-900 bg-slate-100" : "text-slate-600"
                    }`}
                >
                    <User size={24} />
                    <span className="text-xs mt-1 font-medium">Profile</span>
                </Link>
            </div>
        </div>
    )
}
