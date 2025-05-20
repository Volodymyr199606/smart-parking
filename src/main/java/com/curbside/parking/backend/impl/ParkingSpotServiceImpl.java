package com.curbside.parking.backend.impl;

import com.curbside.parking.backend.model.ParkingSpot;
import com.curbside.parking.backend.service.ParkingSpotService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@Service
public class ParkingSpotServiceImpl implements ParkingSpotService {

    private final ParkingSpotRepository repository;

    @Value("${google.api.key}")


    private String apiKey;

    @Autowired
    private SpotBroadcastService broadcaster;

    @Autowired
    private SpotBroadcastService broadcaster;


    @Autowired
    public ParkingSpotServiceImpl(ParkingSpotRepository repository) {
        this.repository = repository;
    }

    @Override
    public List<ParkingSpot> getAllSpots() {
        return repository.findAll();
    }

    @Override
    public List<ParkingSpot> getAvailableSpots() {
        return repository.findByAvailableTrue();
    }

    @Override
    public ParkingSpot saveSpot(ParkingSpot spot) {
        ParkingSpot saved = repository.save(spot);
        broadcaster.broadcastNewSpot(saved);
        return saved;
    }

    @Override
    public ParkingSpot updateAvailability(Long id, boolean available) {
        Optional<ParkingSpot> optionalSpot = repository.findById(id);
        if (optionalSpot.isPresent()) {
            ParkingSpot spot = optionalSpot.get();
            spot.setAvailable(available);
            return repository.save(spot);
        }
        return null;
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSpot(@PathVariable Long id) {
        parkingSpotService.deleteSpot(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/available")
    public ResponseEntity<List<ParkingSpot>> getAllAvailableSpots() {
        List<ParkingSpot> spots = parkingSpotService.getAvailableSpots();
        return ResponseEntity.ok(spots);
    }

    @PostMapping("/update-spots-manually")
    public ResponseEntity<String> updateSpotsManually() {
        parkingSpotService.fetchAndUpdateAvailableSpots();
        return ResponseEntity.ok("Manual update triggered");
    }

    @GetMapping("/nearby")
    public ResponseEntity<List<ParkingSpot>> getNearbySpots(
            @RequestParam double latitude,
            @RequestParam double longitude,
            @RequestParam(defaultValue = "800") double radiusMeters
    ) {

        List<ParkingSpot> nearby = parkingSpotService.getNearbySpots(latitude, longitude, radiusMeters);
        return ResponseEntity.ok(nearby);
    }

    @GetMapping("/reverse-geocode")
    public ResponseEntity<?> reverseGeocode(@RequestParam double lat, @RequestParam double lng) {
        try {
            String url = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" +
                    lat + "," + lng + "&key=" + googleApiKey;

            String result = restTemplate.getForObject(url, String.class);
            return ResponseEntity.ok().body(result);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Reverse geocoding failed: " + e.getMessage());
        }
    }
}