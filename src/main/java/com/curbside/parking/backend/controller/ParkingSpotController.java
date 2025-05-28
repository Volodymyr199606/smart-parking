package com.curbside.parking.backend.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import com.curbside.parking.backend.dto.ParkingSpotDTO;
import com.curbside.parking.backend.service.ParkingSpotService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/parking-spots")
@RequiredArgsConstructor
@Slf4j
public class ParkingSpotController {

    private final ParkingSpotService parkingSpotService;

    @GetMapping
    public ResponseEntity<List<ParkingSpotDTO>> getAllParkingSpots() {
        return ResponseEntity.ok(parkingSpotService.getAllParkingSpots());
    }

    @GetMapping("/available")
    public ResponseEntity<List<ParkingSpotDTO>> getAvailableParkingSpots() {
        return ResponseEntity.ok(parkingSpotService.getAvailableParkingSpots());
    }

    @GetMapping("/nearby")
    public ResponseEntity<List<ParkingSpotDTO>> getNearbyParkingSpots(
            @RequestParam double latitude,
            @RequestParam double longitude,
            @RequestParam(defaultValue = "1000") double radius) {
        return ResponseEntity.ok(parkingSpotService.getNearbyParkingSpots(latitude, longitude, radius));
    }

    @GetMapping("/available/nearby")
    public ResponseEntity<List<ParkingSpotDTO>> getAvailableNearbyParkingSpots(
            @RequestParam double latitude,
            @RequestParam double longitude,
            @RequestParam(defaultValue = "1000") double radius) {
        return ResponseEntity.ok(parkingSpotService.getAvailableNearbyParkingSpots(latitude, longitude, radius));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ParkingSpotDTO> getParkingSpotById(@PathVariable Long id) {
        return ResponseEntity.ok(parkingSpotService.getParkingSpotById(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ParkingSpotDTO> createParkingSpot(@Valid @RequestBody ParkingSpotDTO parkingSpotDTO) {
        return ResponseEntity.ok(parkingSpotService.createParkingSpot(parkingSpotDTO));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ParkingSpotDTO> updateParkingSpot(
            @PathVariable Long id,
            @Valid @RequestBody ParkingSpotDTO parkingSpotDTO) {
        return ResponseEntity.ok(parkingSpotService.updateParkingSpot(id, parkingSpotDTO));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteParkingSpot(@PathVariable Long id) {
        parkingSpotService.deleteParkingSpot(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Report the availability status of a parking spot
     *
     * @param id The ID of the parking spot
     * @param available Whether the spot is available or not
     * @return The updated parking spot
     */
    @PostMapping("/{id}/report")
    public ResponseEntity<ParkingSpotDTO> reportParkingSpotStatus(
            @PathVariable Long id,
            @RequestParam boolean available) {

        log.info("Received report for parking spot {} as {}", id, available ? "available" : "unavailable");

        ParkingSpotDTO updatedSpot = parkingSpotService.updateSpotAvailability(id, available);
        return ResponseEntity.ok(updatedSpot);
    }
}