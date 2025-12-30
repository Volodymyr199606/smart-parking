package com.smart.parking.backend.repository;

import com.smart.parking.backend.model.ParkingSpot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ParkingSpotRepository extends JpaRepository<ParkingSpot, Long> {

    @Query("SELECT p FROM ParkingSpot p WHERE p.available = true")
    List<ParkingSpot> findAllAvailable();

    // PostgreSQL/PostGIS spatial query for nearby spots
    @Query(value = "SELECT * FROM parking_spots p WHERE ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography, :distance)", nativeQuery = true)
    List<ParkingSpot> findNearby(@Param("latitude") double latitude, @Param("longitude") double longitude, @Param("distance") double distanceInMeters);

    // PostgreSQL/PostGIS spatial query for available nearby spots
    @Query(value = "SELECT * FROM parking_spots p WHERE p.available = true AND ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography, :distance)", nativeQuery = true)
    List<ParkingSpot> findAvailableNearby(@Param("latitude") double latitude, @Param("longitude") double longitude, @Param("distance") double distanceInMeters);
}