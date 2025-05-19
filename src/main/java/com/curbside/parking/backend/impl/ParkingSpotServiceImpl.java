package com.curbside.parking.backend.impl;

import com.curbside.parking.backend.model.ParkingSpot;
import com.curbside.parking.backend.service.ParkingSpotService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;

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
}
