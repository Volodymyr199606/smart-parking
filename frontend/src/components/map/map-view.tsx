'use client';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';


import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

// Fix Leaflet icon issues in Next.js
useEffect(() => {
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: markerIcon2x.src,
        iconUrl: markerIcon.src,
        shadowUrl: markerShadow.src,
    });
}, []);

interface ParkingSpot {
    id: number;
    latitude: number;
    longitude: number;
    address: string;
    available: boolean;
    price: number;
    restrictions: string;
}

interface MapViewProps {
    initialLatitude?: number;
    initialLongitude?: number;
    initialZoom?: number;
}

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lng], map.getZoom());
    }, [lat, lng, map]);
    return null;
}

export default function MapView({
                                    initialLatitude = 34.0522,
                                    initialLongitude = -118.2437,
                                    initialZoom = 13,
                                }: MapViewProps) {
    const [parkingSpots, setParkingSpots] = useState<ParkingSpot[]>([]);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        // Get user's location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation([position.coords.latitude, position.coords.longitude]);
                    fetchNearbyParkingSpots(position.coords.latitude, position.coords.longitude);
                },
                (error) => {
                    console.error('Error getting location:', error);
                    fetchAllParkingSpots();
                }
            );
        } else {
            fetchAllParkingSpots();
        }
    }, []);

    const fetchAllParkingSpots = async () => {
        try {
            setLoading(true);
            const response = await api.get('/parking-spots');
            setParkingSpots(response.data);
        } catch (err) {
            console.error('Error fetching parking spots:', err);
            setError('Failed to load parking spots');
        } finally {
            setLoading(false);
        }
    };

    const fetchNearbyParkingSpots = async (latitude: number, longitude: number) => {
        try {
            setLoading(true);
            const response = await api.get('/parking-spots/nearby', {
                params: {
                    latitude,
                    longitude,
                    radius: 5000, // 5km radius
                },
            });
            setParkingSpots(response.data);
        } catch (err) {
            console.error('Error fetching nearby parking spots:', err);
            setError('Failed to load nearby parking spots');
            // Fallback to all spots
            fetchAllParkingSpots();
        } finally {
            setLoading(false);
        }
    };

    const handleSpotClick = (spotId: number) => {
        router.push(`/spot/${spotId}`);
    };

    if (loading) {
        return <div className="flex justify-center items-center h-96">Loading map...</div>;
    }

    if (error) {
        return <div className="text-red-500 text-center p-4">{error}</div>;
    }

    return (
        <div className="h-[calc(100vh-64px)] w-full">
            <MapContainer
                center={userLocation || [initialLatitude, initialLongitude]}
                zoom={initialZoom}
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {userLocation && (
                    <Marker
                        position={userLocation}
                        icon={new L.Icon({
                            iconUrl: '/images/user-marker.png',
                            iconSize: [32, 32],
                            iconAnchor: [16, 32],
                        })}
                    >
                        <Popup>Your location</Popup>
                    </Marker>
                )}

                {userLocation && <MapRecenter lat={userLocation[0]} lng={userLocation[1]} />}

                {parkingSpots.map((spot) => (
                    <Marker
                        key={spot.id}
                        position={[spot.latitude, spot.longitude]}
                        icon={new L.Icon({
                            iconUrl: spot.available
                                ? '/images/available-marker.png'
                                : '/images/unavailable-marker.png',
                            iconSize: [25, 41],
                            iconAnchor: [12, 41],
                        })}
                        eventHandlers={{
                            click: () => handleSpotClick(spot.id),
                        }}
                    >
                        <Popup>
                            <div className="p-2">
                                <h3 className="font-bold">{spot.address}</h3>
                                <p className="text-sm">
                                    Status: <span className={spot.available ? 'text-green-600' : 'text-red-600'}>
                    {spot.available ? 'Available' : 'Unavailable'}
                  </span>
                                </p>
                                {spot.price && <p className="text-sm">Price: ${spot.price}/hr</p>}
                                {spot.restrictions && <p className="text-sm text-gray-600">{spot.restrictions}</p>}
                                <button
                                    className="mt-2 text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                                    onClick={() => handleSpotClick(spot.id)}
                                >
                                    View Details
                                </button>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}