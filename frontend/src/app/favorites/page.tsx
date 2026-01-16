"use client"

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { MapPin, Heart, Navigation, DollarSign, ArrowLeft } from "lucide-react"
import api from "@/lib/api"
import { FavoriteSpot } from "@/lib/types"

export default function FavoritesPage() {
    const { user, isAuthenticated, isLoading } = useAuth()
    const [favorites, setFavorites] = useState<FavoriteSpot[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (isLoading) return

        if (!isAuthenticated) {
            window.location.href = "/login"
            return
        }

        fetchFavorites()
    }, [isAuthenticated, isLoading])

    const fetchFavorites = async () => {
        try {
            setLoading(true)

            const response = await api.get("/users/favorites").catch((err) => {
                // Endpoint doesn't exist yet, return empty array gracefully
                console.warn("Favorites endpoint not available:", err)
                return { data: [] }
            })
            setFavorites(response.data || [])
        } catch (err: unknown) {
            console.warn("Error fetching favorites:", err)
            // Don't show error if endpoint doesn't exist - just show empty state
            setFavorites([])
        } finally {
            setLoading(false)
        }
    }

    const removeFavorite = async (favoriteId: number) => {
        try {
            await api.delete(`/users/favorites/${favoriteId}`).catch(() => {
                // Endpoint doesn't exist yet, remove from local state anyway
                console.warn("Delete favorites endpoint not available")
            })
            // Remove from local state
            setFavorites(favorites.filter((fav) => fav.id !== favoriteId))
        } catch (err: unknown) {
            console.warn("Error removing favorite:", err)
            // Silently fail - user can refresh if needed
        }
    }

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
                    <h1 className="text-3xl font-light text-slate-900 mb-2">My Favorites</h1>
                    <p className="text-slate-600">View and manage your favorite parking locations</p>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-slate-900"></div>
                    </div>
                ) : favorites.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {favorites.map((favorite) => {
                            const spot = favorite.parkingSpot
                            return (
                                <div
                                    key={favorite.id}
                                    className="bg-white rounded-2xl p-6 shadow-soft hover:shadow-md transition-all duration-300 border border-slate-200"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex-1">
                                            <Link
                                                href={`/spot/${spot.id}`}
                                                className="group block"
                                            >
                                                <h3 className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors mb-2">
                                                    {spot.address}
                                                </h3>
                                            </Link>
                                            <div className="flex items-center text-sm text-slate-600 mb-2">
                                                <MapPin size={16} className="mr-1" />
                                                <span>
                                                    {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => removeFavorite(favorite.id)}
                                            className="p-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                                            title="Remove from favorites"
                                        >
                                            <Heart size={20} className="fill-current" />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between mb-4">
                                        <span
                                            className={`text-xs px-3 py-1 rounded-full ${
                                                spot.available
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-red-100 text-red-700"
                                            }`}
                                        >
                                            {spot.available ? "Available" : "Occupied"}
                                        </span>
                                        <div className="flex items-center text-slate-900 font-medium">
                                            <DollarSign size={16} className="mr-1" />
                                            {spot.price ? `${spot.price}/hr` : "Free"}
                                        </div>
                                    </div>

                                    {spot.restrictions && (
                                        <div className="text-sm text-slate-600 mb-4 pb-4 border-b border-slate-200">
                                            <span className="font-medium">Restrictions: </span>
                                            {spot.restrictions}
                                        </div>
                                    )}

                                    {spot.description && (
                                        <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                                            {spot.description}
                                        </p>
                                    )}

                                    <Link
                                        href={`/spot/${spot.id}`}
                                        className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors group"
                                    >
                                        View Details
                                        <Navigation size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl p-12 text-center shadow-soft">
                        <div className="bg-purple-100 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                            <Heart size={32} className="text-purple-600" />
                        </div>
                        <h3 className="text-xl font-medium text-slate-900 mb-2">No favorites yet</h3>
                        <p className="text-slate-600 mb-6">
                            Start adding parking spots to your favorites for quick access
                        </p>
                        <Link
                            href="/map"
                            className="inline-flex items-center bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
                        >
                            <MapPin size={20} className="mr-2" />
                            Find Parking Spots
                        </Link>
                    </div>
                )}
            </div>
        </div>
    )
}
