package com.curbside.parking.backend.controller;

import com.curbside.parking.backend.service.ParkingSpotService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

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
}