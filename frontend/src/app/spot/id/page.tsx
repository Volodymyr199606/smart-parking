"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { MapPin, Clock, DollarSign, Navigation, Heart, Star, Car, ArrowLeft, Share, Phone } from "lucide-react"
import api from "@/lib/api"

interface ParkingSpot {
    id: number
    address: string
    latitude: number
    longitude: number
    available: boolean
    price: number
    restrictions: string
    description?: string
    rating?: number
    totalReviews?: number
    amenities?: string[]
    operatingHours?: string
    contactNumber?: string
}

export default function SpotDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const [spot, setSpot] = useState<ParkingSpot | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isFavorite, setIsFavorite] = useState(false)
    const [addingToFavorites, setAddingToFavorites] = useState(false)

    useEffect(() => {
        if (params.id) {
            fetchSpotDetails(params.id as string)
        }
    }, [params.id])

    const fetchSpotDetails = async (spotId: string) => {
        try {
            setLoading(true)
            const response = await api.get(`/parking-spots/${spotId}`)
            setSpot(response.data)

            // Check if spot is in favorites
            try {
                const favoritesResponse = await api.get("/users/favorites")
                const favoriteIds = favoritesResponse.data.map((fav: any) => fav.id)
                setIsFavorite(favoriteIds.includes(Number.parseInt(spotId)))
            } catch (err) {
                // User might not be logged in, ignore error
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to load parking spot details")
        } finally {
            setLoading(false)
        }
    }

    const toggleFavorite = async () => {
        if (!spot) return

        try {
            setAddingToFavorites(true)
            if (isFavorite) {
                await api.delete(`/users/favorites/${spot.id}`)
                setIsFavorite(false)
            } else {
                await api.post(`/users/favorites/${spot.id}`)
                setIsFavorite(true)
            }
        } catch (err: any) {
            console.error("Error toggling favorite:", err)
            if (err.response?.status === 401) {
                router.push("/login")
            }
        } finally {
            setAddingToFavorites(false)
        }
    }

    const getDirections = () => {
        if (!spot) return
        const url = `https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}`
        window.open(url, "_blank")
    }

    const shareSpot = async () => {
        if (!spot) return

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Parking Spot - ${spot.address}`,
                    text: `Check out this parking spot: ${spot.address}`,
                    url: window.location.href,
                })
            } catch (err) {
                console.log("Error sharing:", err)
            }
        } else {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(window.location.href)
            alert("Link copied to clipboard!")
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900 mx-auto mb-4"></div>
                    <p className="text-slate-600">Loading spot details...</p>
                </div>
            </div>
        )
    }

    if (error || !spot) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center max-w-md mx-auto px-6">
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error || "Parking spot not found"}</div>
                    <Link href="/map" className="inline-flex items-center text-slate-600 hover:text-slate-900 transition-colors">
                        <ArrowLeft size={20} className="mr-2" />
                        Back to Map
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => router.back()}
                            className="flex items-center text-slate-600 hover:text-slate-900 transition-colors"
                        >
                            <ArrowLeft size={20} className="mr-2" />
                            Back
                        </button>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={shareSpot}
                                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <Share size={20} />
                            </button>
                            <button
                                onClick={toggleFavorite}
                                disabled={addingToFavorites}
                                className={`p-2 rounded-full transition-colors ${
                                    isFavorite
                                        ? "text-red-500 hover:text-red-600 bg-red-50"
                                        : "text-slate-600 hover:text-red-500 hover:bg-slate-100"
                                }`}
                            >
                                <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-6 py-8">
                <div className="max-w-4xl mx-auto">
                    {/* Main Info Card */}
                    <div className="bg-white rounded-2xl shadow-soft p-8 mb-8">
                        <div className="flex items-start justify-between mb-6">
                            <div className="flex-1">
                                <h1 className="text-3xl font-light text-slate-900 mb-2">{spot.address}</h1>
                                <div className="flex items-center space-x-4 text-sm text-slate-600">
                                    {spot.rating && (
                                        <div className="flex items-center">
                                            <Star size={16} className="text-yellow-400 fill-current mr-1" />
                                            <span>{spot.rating}</span>
                                            {spot.totalReviews && <span className="ml-1">({spot.totalReviews} reviews)</span>}
                                        </div>
                                    )}
                                    <div className="flex items-center">
                                        <MapPin size={16} className="mr-1" />
                                        <span>Parking Spot</span>
                                    </div>
                                </div>
                            </div>
                            <div
                                className={`px-4 py-2 rounded-full text-sm font-medium ${
                                    spot.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                }`}
                            >
                                {spot.available ? "Available" : "Unavailable"}
                            </div>
                        </div>

                        {/* Key Details */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="flex items-center space-x-3">
                                <div className="bg-blue-100 p-3 rounded-full">
                                    <DollarSign size={20} className="text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Price</p>
                                    <p className="font-medium text-slate-900">{spot.price ? `$${spot.price}/hr` : "Free"}</p>
                                </div>
                            </div>

                            {spot.operatingHours && (
                                <div className="flex items-center space-x-3">
                                    <div className="bg-green-100 p-3 rounded-full">
                                        <Clock size={20} className="text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-600">Hours</p>
                                        <p className="font-medium text-slate-900">{spot.operatingHours}</p>
                                    </div>
                                </div>
                            )}

                            {spot.contactNumber && (
                                <div className="flex items-center space-x-3">
                                    <div className="bg-purple-100 p-3 rounded-full">
                                        <Phone size={20} className="text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-600">Contact</p>
                                        <p className="font-medium text-slate-900">{spot.contactNumber}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={getDirections}
                                className="flex-1 bg-slate-900 text-white hover:bg-slate-800 px-6 py-4 rounded-xl font-medium transition-colors flex items-center justify-center"
                            >
                                <Navigation size={20} className="mr-2" />
                                Get Directions
                            </button>
                            <Link
                                href="/map"
                                className="flex-1 border border-slate-300 text-slate-700 hover:bg-slate-50 px-6 py-4 rounded-xl font-medium transition-colors flex items-center justify-center"
                            >
                                <MapPin size={20} className="mr-2" />
                                View on Map
                            </Link>
                        </div>
                    </div>

                    {/* Description */}
                    {spot.description && (
                        <div className="bg-white rounded-2xl shadow-soft p-8 mb-8">
                            <h2 className="text-xl font-medium text-slate-900 mb-4">Description</h2>
                            <p className="text-slate-600 leading-relaxed">{spot.description}</p>
                        </div>
                    )}

                    {/* Restrictions */}
                    {spot.restrictions && (
                        <div className="bg-white rounded-2xl shadow-soft p-8 mb-8">
                            <h2 className="text-xl font-medium text-slate-900 mb-4">Restrictions & Rules</h2>
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                <p className="text-amber-800">{spot.restrictions}</p>
                            </div>
                        </div>
                    )}

                    {/* Amenities */}
                    {spot.amenities && spot.amenities.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-soft p-8">
                            <h2 className="text-xl font-medium text-slate-900 mb-4">Amenities</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {spot.amenities.map((amenity, index) => (
                                    <div key={index} className="flex items-center space-x-2 text-slate-600">
                                        <Car size={16} />
                                        <span className="text-sm">{amenity}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
