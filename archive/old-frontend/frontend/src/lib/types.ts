// Type definitions for better TypeScript support
export interface ParkingSpot {
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
    createdAt?: string
    updatedAt?: string
}

export interface User {
    id: number
    email: string
    fullName: string
    roles: string[]
    createdAt?: string
}

export interface AuthResponse {
    token: string
    email: string
    fullName: string
    roles: string[]
}

export interface ApiError {
    message: string
    status: number
    timestamp: string
}

export interface FavoriteSpot {
    id: number
    userId: number
    parkingSpotId: number
    parkingSpot: ParkingSpot
    createdAt: string
}
