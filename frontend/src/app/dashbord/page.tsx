"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { MapPin, Clock, Car, Search, Navigation, Heart, TrendingUp } from "lucide-react"
import api from "@/lib/api"

interface ParkingSpot {
    id: number
    address: string
    available: boolean
    price: number
    latitude: number
    longitude: number
    distance?: number
}

interface DashboardStats {
    totalSpots: number
    availableSpots: number
    favoriteSpots: number
    recentSearches: number
}

export default function DashboardPage() {
    const { user, isAuthenticated, isLoading } = useAuth()
    const [nearbySpots, setNearbySpots] = useState<ParkingSpot[]>([])
    const [stats, setStats] = useState<DashboardStats>({
        totalSpots: 0,
        availableSpots: 0,
        favoriteSpots: 0,
        recentSearches: 0,
    })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
// const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

    useEffect(() => {
        if (isLoading) return

        if (!isAuthenticated) {
            window.location.href = "/login"
            return
        }

        // Get user's location and fetch data
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords
// setUserLocation({ lat: latitude, lng: longitude })
                    fetchDashboardData(latitude, longitude)
                },
                (error) => {
                    console.error("Error getting location:", error)
                    fetchDashboardData()
                },
            )
        } else {
            fetchDashboardData()
        }
    }, [isAuthenticated, isLoading])

    const fetchDashboardData = async (latitude?: number, longitude?: number) => {
        try {
            setLoading(true)

            // Fetch nearby spots
            if (latitude && longitude) {
                const nearbyResponse = await api.get("/parking-spots/nearby", {
                    params: {
                        latitude,
                        longitude,
                        radius: 2000, // 2km radius
                    },
                })
                setNearbySpots(nearbyResponse.data.slice(0, 6)) // Show only first 6 spots
            }

            // Fetch dashboard stats
            const [spotsResponse, favoritesResponse] = await Promise.all([
                api.get("/parking-spots"),
                api
                    .get("/users/favorites")
                    .catch(() => ({ data: [] })), // Handle if user has no favorites
            ])

            const allSpots = spotsResponse.data
            const availableSpots = allSpots.filter((spot: ParkingSpot) => spot.available)

            setStats({
                totalSpots: allSpots.length,
                availableSpots: availableSpots.length,
                favoriteSpots: favoritesResponse.data.length,
                recentSearches: 0, // This would come from user's search history
            })
        } catch (err: unknown) {
            console.error("Error fetching dashboard data:", err)
            setError("Failed to load dashboard data")
        } finally {
            setLoading(false)
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
                {/* Welcome Section */}
                <div className="mb-8">
                    <h1 className="text-3xl font-light text-slate-900 mb-2">
                        Welcome back, <span className="font-medium">{user?.fullName}</span>
                    </h1>
                    <p className="text-slate-600">Find and manage parking spots near you</p>
                </div>

                {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 border border-red-200">{error}</div>}

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-2xl p-6 shadow-soft">
                        <div className="flex items-center justify-between mb-4">
                            <div className="bg-blue-100 p-3 rounded-xl">
                                <MapPin className="text-blue-600" size={24} />
                            </div>
                            <TrendingUp className="text-green-500" size={20} />
                        </div>
                        <h3 className="text-2xl font-light text-slate-900 mb-1">{stats.totalSpots}</h3>
                        <p className="text-slate-600 text-sm">Total Spots</p>
                    </div>

                    <div className="bg-white rounded-2xl p-6 shadow-soft">
                        <div className="flex items-center justify-between mb-4">
                            <div className="bg-green-100 p-3 rounded-xl">
                                <Car className="text-green-600" size={24} />
                            </div>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Live</span>
                        </div>
                        <h3 className="text-2xl font-light text-slate-900 mb-1">{stats.availableSpots}</h3>
                        <p className="text-slate-600 text-sm">Available Now</p>
                    </div>

                    <div className="bg-white rounded-2xl p-6 shadow-soft">
                        <div className="flex items-center justify-between mb-4">
                            <div className="bg-purple-100 p-3 rounded-xl">
                                <Heart className="text-purple-600" size={24} />
                            </div>
                        </div>
                        <h3 className="text-2xl font-light text-slate-900 mb-1">{stats.favoriteSpots}</h3>
                        <p className="text-slate-600 text-sm">Saved Spots</p>
                    </div>

                    <div className="bg-white rounded-2xl p-6 shadow-soft">
                        <div className="flex items-center justify-between mb-4">
                            <div className="bg-amber-100 p-3 rounded-xl">
                                <Clock className="text-amber-600" size={24} />
                            </div>
                        </div>
                        <h3 className="text-2xl font-light text-slate-900 mb-1">{stats.recentSearches}</h3>
                        <p className="text-slate-600 text-sm">Recent Searches</p>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Link
                        href="/map"
                        className="group bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-2xl hover:from-blue-100 hover:to-indigo-100 transition-all duration-300 hover:scale-105"
                    >
                        <div className="flex items-center mb-4">
                            <div className="bg-blue-100 p-4 rounded-xl mr-4 group-hover:bg-blue-200 transition-colors">
                                <MapPin className="text-blue-600" size={28} />
                            </div>
                            <h2 className="text-xl font-medium text-slate-900">Find Parking</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Discover available parking spots near your current location with real-time updates
                        </p>
                    </Link>

                    <Link
                        href="/favorites"
                        className="group bg-gradient-to-br from-purple-50 to-pink-50 p-8 rounded-2xl hover:from-purple-100 hover:to-pink-100 transition-all duration-300 hover:scale-105"
                    >
                        <div className="flex items-center mb-4">
                            <div className="bg-purple-100 p-4 rounded-xl mr-4 group-hover:bg-purple-200 transition-colors">
                                <Heart className="text-purple-600" size={28} />
                            </div>
                            <h2 className="text-xl font-medium text-slate-900">Favorites</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            View and manage your favorite parking locations for quick access
                        </p>
                    </Link>

                    <Link
                        href="/profile"
                        className="group bg-gradient-to-br from-emerald-50 to-teal-50 p-8 rounded-2xl hover:from-emerald-100 hover:to-teal-100 transition-all duration-300 hover:scale-105"
                    >
                        <div className="flex items-center mb-4">
                            <div className="bg-emerald-100 p-4 rounded-xl mr-4 group-hover:bg-emerald-200 transition-colors">
                                <Car className="text-emerald-600" size={28} />
                            </div>
                            <h2 className="text-xl font-medium text-slate-900">Profile</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">Manage your account settings and parking preferences</p>
                    </Link>
                </div>

                {/* Nearby Available Spots */}
                <div className="bg-white rounded-2xl shadow-soft p-8">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-light text-slate-900">Nearby Available Spots</h2>
                        <Link href="/map" className="text-slate-600 hover:text-slate-900 flex items-center transition-colors group">
                            View All
                            <Navigation size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-slate-900"></div>
                        </div>
                    ) : nearbySpots.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {nearbySpots.map((spot) => (
                                <Link
                                    key={spot.id}
                                    href={`/spot/${spot.id}`}
                                    className="group border border-slate-200 rounded-xl p-6 hover:border-slate-300 hover:shadow-soft transition-all duration-300"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="font-medium text-slate-900 group-hover:text-slate-700 transition-colors">
                                            {spot.address}
                                        </h3>
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Available</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm text-slate-600">
                                        <span>{spot.price ? `$${spot.price}/hr` : "Free"}</span>
                                        {spot.distance && <span>{spot.distance.toFixed(1)} km away</span>}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-slate-500">
                            <Search size={48} className="mx-auto mb-4 text-slate-400" />
                            <p className="text-lg mb-2">No available parking spots found nearby</p>
                            <p className="text-sm">Try expanding your search on the map</p>
                            <Link
                                href="/map"
                                className="inline-flex items-center mt-4 text-slate-900 hover:text-slate-700 transition-colors"
                            >
                                <MapPin size={16} className="mr-2" />
                                Open Map
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
