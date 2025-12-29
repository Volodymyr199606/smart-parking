"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
    ArrowLeft
} from "lucide-react"
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
    const [spot, setSpot] = useState<ParkingSpot | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

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

            
            try {

            } catch {

            }
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message)
            }
        } finally {
            setLoading(false)
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
            {/* ... UI remains unchanged ... */}
        </div>
    )
}
