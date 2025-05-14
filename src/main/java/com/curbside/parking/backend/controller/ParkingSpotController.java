package com.curbside.parking.backend.controller;

import com.curbside.parking.backend.service.ParkingSpotService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/parking")
public class ParkingSpotController {


    @Value("${google.api.key}")
    private String googleApiKey;


    private final ParkingSpotService parkingSpotService;
    private final RestTemplate restTemplate;

    @Autowired
    public ParkingSpotController(ParkingSpotService parkingSpotService, RestTemplate restTemplate) {
        this.parkingSpotService = parkingSpotService;
        this.restTemplate = restTemplate;
    }

    @PostMapping("/nearby")
    public ResponseEntity<List<ParkingSpotDTO>> getNearbyParking(@RequestBody Map<String, Double> location) {
        double userLat = location.get("latitude");
        double userLng = location.get("longitude");
        double radiusMeters = location.getOrDefault("radius", 500.0);

        String url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
                "?location=" + userLat + "," + userLng +
                "&radius=1500&type=parking&key=" + googleApiKey;

        ;

        String jsonResponse = restTemplate.getForObject(url, String.class);
        List<ParkingSpotDTO> filteredSpots = new ArrayList<>();

        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode root = mapper.readTree(jsonResponse);
            JsonNode results = root.path("results");

            for (JsonNode result : results) {
                double lat = result.path("geometry").path("location").path("lat").asDouble();
                double lng = result.path("geometry").path("location").path("lng").asDouble();


                if (isWithinRadius(userLat, userLng, lat, lng, radiusMeters)) {
                    String name = result.path("name").asText();
                    String address = result.path("vicinity").asText();
                    filteredSpots.add(new ParkingSpotDTO(name, lat, lng, address));
                }
            }

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).build();
        }

        return ResponseEntity.ok(filteredSpots);
    }

    private boolean isWithinRadius(double lat1, double lon1, double lat2, double lon2, double radiusMeters) {
        final int EARTH_RADIUS = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        double distance = EARTH_RADIUS * c;
        return distance <= radiusMeters;
    }
}