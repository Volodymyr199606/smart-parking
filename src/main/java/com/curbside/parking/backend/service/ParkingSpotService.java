package com.curbside.parking.backend.service;

import com.curbside.parking.backend.dto.ParkingSpotDTO;
import java.util.List;

public interface ParkingSpotService {
    List<ParkingSpotDTO> getAllParkingSpots();
    List<ParkingSpotDTO> getAvailableParkingSpots();
    List<ParkingSpotDTO> getNearbyParkingSpots(double latitude, double longitude, double radiusInMeters);
    List<ParkingSpotDTO> getAvailableNearbyParkingSpots(double latitude, double longitude, double radiusInMeters);
    ParkingSpotDTO getParkingSpotById(Long id);
    ParkingSpotDTO createParkingSpot(ParkingSpotDTO parkingSpotDTO);
    ParkingSpotDTO updateParkingSpot(Long id, ParkingSpotDTO parkingSpotDTO);
    void deleteParkingSpot(Long id);

    ParkingSpotDTO updateSpotAvailability(Long id, boolean available);
}