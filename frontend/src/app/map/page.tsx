"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, MapPin, Navigation, DollarSign, Search, Filter } from "lucide-react"

// Mock parking data - San Francisco locations on busiest streets (without timestamps to avoid hydration issues)
const mockParkingSpotsData = [
    {
        id: 1,
        latitude: 37.7749,
        longitude: -122.4194,
        address: "123 Market Street, San Francisco, CA",
        available: true,
        price: 8,
        restrictions: "2 hour limit",
        distance: 0.2,
    },
    {
        id: 2,
        latitude: 37.7849,
        longitude: -122.4094,
        address: "456 Union Square, San Francisco, CA",
        available: true,
        price: 12,
        restrictions: "Peak hours only",
        distance: 0.3,
    },
    {
        id: 3,
        latitude: 37.7649,
        longitude: -122.4294,
        address: "789 Mission Street, San Francisco, CA",
        available: false,
        price: 10,
        restrictions: "Weekdays only",
        distance: 0.5,
    },
    {
        id: 4,
        latitude: 37.7849,
        longitude: -122.4094,
        address: "321 Geary Boulevard, San Francisco, CA",
        available: true,
        price: 6,
        restrictions: "No restrictions",
        distance: 0.4,
    },
    {
        id: 5,
        latitude: 37.7941,
        longitude: -122.4078,
        address: "555 Grant Avenue, Chinatown, San Francisco, CA",
        available: true,
        price: 15,
        restrictions: "High traffic area",
        distance: 0.6,
    },
    {
        id: 6,
        latitude: 37.8024,
        longitude: -122.4058,
        address: "666 Lombard Street, San Francisco, CA",
        available: false,
        price: 20,
        restrictions: "Tourist attraction - premium pricing",
        distance: 0.8,
    },
    {
        id: 7,
        latitude: 37.8085,
        longitude: -122.4158,
        address: "777 Fisherman's Wharf, San Francisco, CA",
        available: true,
        price: 18,
        restrictions: "Tourist area",
        distance: 1.2,
    },
    {
        id: 8,
        latitude: 37.7879,
        longitude: -122.4075,
        address: "888 Van Ness Avenue, San Francisco, CA",
        available: true,
        price: 7,
        restrictions: "2 hour limit",
        distance: 0.7,
    },
    {
        id: 9,
        latitude: 37.7699,
        longitude: -122.4244,
        address: "999 Fillmore Street, San Francisco, CA",
        available: true,
        price: 9,
        restrictions: "No restrictions",
        distance: 0.9,
    },
    {
        id: 10,
        latitude: 37.7580,
        longitude: -122.4180,
        address: "111 Powell Street, Union Square, San Francisco, CA",
        available: false,
        price: 25,
        restrictions: "Shopping district - peak hours",
        distance: 0.35,
    },
    {
        id: 11,
        latitude: 37.7599,
        longitude: -122.4144,
        address: "222 Castro Street, San Francisco, CA",
        available: true,
        price: 6,
        restrictions: "Evening hours",
        distance: 1.1,
    },
    {
        id: 12,
        latitude: 37.7649,
        longitude: -122.4214,
        address: "333 Valencia Street, Mission District, San Francisco, CA",
        available: true,
        price: 5,
        restrictions: "No restrictions",
        distance: 0.65,
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
    lastUpdated: string
}

function InteractiveParkingMap() {
    const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null)
    const [parkingSpots, setParkingSpots] = useState<ParkingSpot[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [showAvailableOnly, setShowAvailableOnly] = useState(false)
    const [isMounted, setIsMounted] = useState(false)

    // Initialize parking spots on client side only to avoid hydration mismatch
    useEffect(() => {
        setIsMounted(true)
        setParkingSpots(
            mockParkingSpotsData.map((spot) => ({
                ...spot,
                lastUpdated: new Date().toISOString(),
            })),
        )
    }, [])

    // Simulate real-time updates
    useEffect(() => {
        const interval = setInterval(() => {
            setParkingSpots((prev) =>
                prev.map((spot) => ({
                    ...spot,
                    // Randomly change availability for demo
                    available: Math.random() > 0.3,
                    lastUpdated: new Date().toISOString(),
                })),
            )
        }, 10000) // Update every 10 seconds

        return () => clearInterval(interval)
    }, [])

    const filteredSpots = parkingSpots.filter((spot) => {
        const matchesSearch = spot.address.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesFilter = showAvailableOnly ? spot.available : true
        return matchesSearch && matchesFilter
    })

    const getDirections = (spot: ParkingSpot) => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}`
        window.open(url, "_blank")
    }

    return (
        <div className="h-full w-full flex flex-row bg-white rounded-xl shadow-soft overflow-hidden">
            {/* Map Section */}
            <div className="flex-1 relative min-w-0">
                {/* Map Placeholder with Interactive Elements */}
                <div className="h-full bg-gradient-to-br from-blue-50 to-slate-100 relative overflow-hidden">
                    {/* Grid Background */}
                    <div className="absolute inset-0 opacity-10">
                        <div className="grid grid-cols-12 h-full">
                            {Array.from({ length: 144 }).map((_, i) => (
                                <div key={i} className="border border-slate-300"></div>
                            ))}
                        </div>
                    </div>

                    {/* Real-time indicator */}
                    <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center z-10">
                        <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></div>
                        Live Updates
                    </div>

                    {/* Location Indicator */}
                    <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium z-10">
                        📍 San Francisco
                    </div>

                    {/* Your Location */}
                    <div
                        className="absolute w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg z-10"
                        style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
                    >
                        <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-75"></div>
                    </div>

                    {/* Parking Spot Markers */}
                    {filteredSpots.map((spot, index) => (
                        <button
                            key={spot.id}
                            onClick={() => setSelectedSpot(spot)}
                            className={`absolute w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 z-10 ${
                                spot.available ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"
                            }`}
                            style={{
                                left: `${20 + ((index * 15) % 60)}%`,
                                top: `${25 + Math.floor(index / 4) * 15}%`,
                            }}
                            title={spot.address}
                        >
                            <MapPin size={16} className="text-white" />
                        </button>
                    ))}

                    {/* Map Controls */}
                    <div className="absolute bottom-4 right-4 flex flex-col space-y-2 z-10">
                        <button className="bg-white border border-slate-300 rounded-lg p-2 shadow-md hover:bg-slate-50 transition-colors">
                            <span className="text-lg font-bold text-slate-700">+</span>
                        </button>
                        <button className="bg-white border border-slate-300 rounded-lg p-2 shadow-md hover:bg-slate-50 transition-colors">
                            <span className="text-lg font-bold text-slate-700">−</span>
                        </button>
                    </div>
                </div>

                {/* Selected spot popup */}
                {selectedSpot && (
                    <div className="absolute bottom-4 left-4 right-4 lg:right-auto lg:w-80 bg-white rounded-xl shadow-lg p-4 z-20">
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

                        {selectedSpot.restrictions && (
                            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-amber-800 text-xs">{selectedSpot.restrictions}</p>
                            </div>
                        )}

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

                        <div className="mt-2 text-xs text-slate-500">
                            Last updated: {isMounted ? new Date(selectedSpot.lastUpdated).toLocaleTimeString() : "Loading..."}
                        </div>
                    </div>
                )}
            </div>

            {/* Sidebar */}
            <div className="w-64 sm:w-72 md:w-80 flex-shrink-0 border-l border-slate-200 flex flex-col">
                {/* Search and filters */}
                <div className="p-4 border-b border-slate-200">
                    <div className="relative mb-3">
                        <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors"
                        />
                    </div>
                    <button
                        onClick={() => setShowAvailableOnly(!showAvailableOnly)}
                        className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            showAvailableOnly ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                    >
                        <Filter size={16} className="mr-2" />
                        Available Only
                    </button>
                </div>

                {/* Spots list */}
                <div className="flex-1 overflow-y-auto">
                    <div className="p-4">
                        <h3 className="text-lg font-medium text-slate-900 mb-4">
                            Parking Spots ({filteredSpots.filter((s) => s.available).length} available)
                        </h3>
                        <div className="space-y-3">
                            {filteredSpots.map((spot) => (
                                <div
                                    key={spot.id}
                                    className={`p-3 border rounded-lg cursor-pointer transition-all duration-300 hover:shadow-md ${
                                        selectedSpot?.id === spot.id
                                            ? "border-slate-900 bg-slate-50"
                                            : "border-slate-200 hover:border-slate-300"
                                    }`}
                                    onClick={() => setSelectedSpot(spot)}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                            <h4 className="font-medium text-slate-900 text-sm mb-1">{spot.address}</h4>
                                            <div className="flex items-center space-x-3 text-xs text-slate-600">
                                                <span>{spot.price ? `$${spot.price}/hr` : "Free"}</span>
                                                <span>{spot.distance} miles</span>
                                            </div>
                                        </div>
                                        <div className={`w-3 h-3 rounded-full ${spot.available ? "bg-green-500" : "bg-red-500"}`}></div>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        Updated: {isMounted ? new Date(spot.lastUpdated).toLocaleTimeString() : "Loading..."}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function MapPage() {
    return (
        <div className="h-screen bg-slate-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 p-4">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center space-x-4">
                        <Link href="/" className="flex items-center text-slate-600 hover:text-slate-900 transition-colors">
                            <ArrowLeft size={20} className="mr-2" />
                            Back to Home
                        </Link>
                        <h1 className="text-xl font-medium text-slate-900">Find Parking</h1>
                    </div>
                    <Link
                        href="/register"
                        className="bg-slate-900 text-white hover:bg-slate-800 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                    >
                        Sign Up
                    </Link>
                </div>
            </div>

            {/* Map Container */}
            <div className="flex-1 p-4">
                <div className="h-full max-w-7xl mx-auto">
                    <InteractiveParkingMap />
                </div>
            </div>
        </div>
    )
}
