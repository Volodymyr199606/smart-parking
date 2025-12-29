"use client"

import { useEffect, useRef, useState } from "react"
import { MapPin, Navigation, DollarSign } from "lucide-react"
import type { Map as LeafletMap } from 'leaflet';

const mockParkingSpots = [
    {
        id: 1,
        latitude: 40.7128,
        longitude: -74.006,
        address: "123 Broadway, New York, NY",
        available: true,
        price: 5,
        restrictions: "2 hour limit",
        distance: 0.2,
    },
    {
        id: 2,
        latitude: 40.7589,
        longitude: -73.9851,
        address: "456 Central Park West, New York, NY",
        available: true,
        price: 8,
        restrictions: "No restrictions",
        distance: 0.5,
    },
    {
        id: 3,
        latitude: 40.7505,
        longitude: -73.9934,
        address: "789 Times Square, New York, NY",
        available: false,
        price: 12,
        restrictions: "Weekdays only",
        distance: 0.8,
    },
    {
        id: 4,
        latitude: 40.7282,
        longitude: -74.0776,
        address: "321 Liberty Street, New York, NY",
        available: true,
        price: 0,
        restrictions: "Free parking",
        distance: 1.2,
    },
]

interface ParkingSpot {
    id: number
    latitude: number
    longitude: number
    address: string
    available: boolean
    price: number
    restrictions: string
    distance: number
}

export default function ParkingMap() {
    const mapRef = useRef<HTMLDivElement>(null)
    const [map, setMap] = useState<LeafletMap | null>(null)
    const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null)
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    })
                },
                () => {
                    console.log("Location access denied, using default location")
                    setUserLocation({ lat: 40.7128, lng: -74.006 })
                }
            )
        } else {
            setUserLocation({ lat: 40.7128, lng: -74.006 })
        }
    }, [])

    useEffect(() => {
        if (!userLocation || !mapRef.current) return

        const loadMap = async () => {
            try {
                const L = await import("leaflet")

                const mapInstance = L.map(mapRef.current!).setView([userLocation.lat, userLocation.lng], 13)

                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: "© OpenStreetMap contributors",
                }).addTo(mapInstance)

                const userIcon = L.divIcon({
                    html: `<div style="width: 16px; height: 16px; background: #3b82f6; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
                    className: "user-location-marker",
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                })

                L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(mapInstance).bindPopup("Your Location")

                mockParkingSpots.forEach((spot) => {
                    const markerColor = spot.available ? "#10b981" : "#ef4444"
                    const markerIcon = L.divIcon({
                        html: `<div style="width: 24px; height: 24px; background: ${markerColor}; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
                     <svg style="width: 12px; height: 12px; color: white;" fill="currentColor" viewBox="0 0 20 20">
                       <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                     </svg>
                   </div>`,
                        className: "parking-spot-marker",
                        iconSize: [24, 24],
                        iconAnchor: [12, 24],
                    })

                    L.marker([spot.latitude, spot.longitude], { icon: markerIcon })
                        .addTo(mapInstance)
                        .on("click", () => setSelectedSpot(spot))
                })

                setMap(mapInstance)
                setLoading(false)
            } catch (err) {
                console.error("Error loading map:", err)
                setError("Failed to load map. Please refresh the page.")
                setLoading(false)
            }
        }

        loadMap()

        return () => {
            if (map) {
                map.remove()
            }
        }
    }, [userLocation, map]) // ✅ Added `map` to dependency array

    const getDirections = (spot: ParkingSpot) => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}`
        window.open(url, "_blank")
    }

    if (error) {
        return (
            <div className="h-full w-full bg-slate-100 rounded-xl flex items-center justify-center">
                <div className="text-center">
                    <div className="text-red-500 mb-2">⚠️</div>
                    <p className="text-slate-600">{error}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="relative h-full w-full">
            {loading && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-slate-900 mx-auto mb-2"></div>
                        <p className="text-slate-600">Loading map...</p>
                    </div>
                </div>
            )}

            <div ref={mapRef} className="h-full w-full rounded-xl" />

            {selectedSpot && (
                <div className="absolute bottom-4 left-4 right-4 bg-white rounded-xl shadow-lg p-4 z-10">
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                            <h3 className="font-medium text-slate-900 mb-1">{selectedSpot.address}</h3>
                            <div className="flex items-center space-x-4 text-sm text-slate-600">
                                <div className="flex items-center">
                                    <DollarSign size={14} className="mr-1" />
                                    <span>{selectedSpot.price ? `$${selectedSpot.price}/hr` : "Free"}</span>
                                </div>
                                <div className="flex items-center">
                                    <MapPin size={14} className="mr-1" />
                                    <span>{selectedSpot.distance} miles away</span>
                                </div>
                            </div>
                        </div>
                        <div
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                                selectedSpot.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}
                        >
                            {selectedSpot.available ? "Available" : "Unavailable"}
                        </div>
                    </div>

                    <div className="flex space-x-3">
                        <button
                            onClick={() => getDirections(selectedSpot)}
                            className="flex-1 bg-slate-900 text-white hover:bg-slate-800 px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center justify-center"
                        >
                            <Navigation size={16} className="mr-2" />
                            Directions
                        </button>
                        <button
                            onClick={() => setSelectedSpot(null)}
                            className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
                        >
                            Close
                        </button>
                    </div>

                    {selectedSpot.restrictions && (
                        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-amber-800 text-xs">{selectedSpot.restrictions}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
