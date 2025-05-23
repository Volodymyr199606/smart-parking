package com.curbside.parking.backend.impl;

import com.curbside.parking.backend.dto.ParkingSpotDTO;
import com.curbside.parking.backend.event.ParkingSpotUpdateEvent;
import com.curbside.parking.backend.exception.ResourceNotFoundException;
import com.curbside.parking.backend.model.ParkingSpot;
import com.curbside.parking.backend.repository.ParkingSpotRepository;
import com.curbside.parking.backend.service.ParkingSpotService;
import com.curbside.parking.backend.util.GeometryUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@Slf4j
public class ParkingSpotServiceImpl implements ParkingSpotService {

    private static final String ENTITY_NAME = "ParkingSpot"; // Constant to avoid duplication
    private static final String FIELD_ID = "id";

    private final ParkingSpotRepository repository;
    private final GeometryUtil geometryUtil;
    private final ApplicationEventPublisher eventPublisher;

    @Autowired
    public ParkingSpotServiceImpl(
            ParkingSpotRepository repository,
            GeometryUtil geometryUtil,
            ApplicationEventPublisher eventPublisher) {
        this.repository = repository;
        this.geometryUtil = geometryUtil;
        this.eventPublisher = eventPublisher;
    }

    @Override
    public List<ParkingSpotDTO> getAllParkingSpots() {
        log.info("Fetching all parking spots");
        List<ParkingSpot> spots = repository.findAll();
        log.debug("Found {} parking spots", spots.size());

        return spots.stream()
                .map(this::convertToDTO)
                .toList(); // Using toList() instead of collect(Collectors.toList())
    }

    @Override
    public List<ParkingSpotDTO> getAvailableParkingSpots() {
        log.info("Fetching available parking spots");
        List<ParkingSpot> spots = repository.findAllAvailable();
        log.debug("Found {} available parking spots", spots.size());

        return spots.stream()
                .map(this::convertToDTO)
                .toList();
    }

    @Override
    public List<ParkingSpotDTO> getNearbyParkingSpots(double latitude, double longitude, double radiusInMeters) {
        log.info("Finding parking spots near coordinates: lat={}, lng={}, radius={}m", latitude, longitude, radiusInMeters);

        List<ParkingSpot> spots = repository.findNearby(latitude, longitude, radiusInMeters);
        log.debug("Found {} nearby parking spots", spots.size());

        return spots.stream()
                .map(this::convertToDTO)
                .toList();
    }

    @Override
    public List<ParkingSpotDTO> getAvailableNearbyParkingSpots(double latitude, double longitude, double radiusInMeters) {
        log.info("Finding available parking spots near coordinates: lat={}, lng={}, radius={}m", latitude, longitude, radiusInMeters);

        List<ParkingSpot> spots = repository.findAvailableNearby(latitude, longitude, radiusInMeters);
        log.debug("Found {} available nearby parking spots", spots.size());

        return spots.stream()
                .map(this::convertToDTO)
                .toList();
    }

    @Override
    public ParkingSpotDTO getParkingSpotById(Long id) {
        log.info("Retrieving parking spot with ID: {}", id);

        ParkingSpot parkingSpot = repository.findById(id)
                .orElseThrow(() -> {
                    log.error("Parking spot not found with ID: {}", id);
                    return new ResourceNotFoundException(ENTITY_NAME, FIELD_ID, id);
                });

        log.debug("Successfully retrieved parking spot with ID: {}", id);
        return convertToDTO(parkingSpot);
    }

    @Override
    public ParkingSpotDTO createParkingSpot(ParkingSpotDTO parkingSpotDTO) {
        log.info("Creating new parking spot at address: {}", parkingSpotDTO.getAddress());

        try {
            ParkingSpot parkingSpot = convertToEntity(parkingSpotDTO);
            parkingSpot.setLocation(geometryUtil.createPoint(parkingSpot.getLongitude(), parkingSpot.getLatitude()));
            ParkingSpot savedParkingSpot = repository.save(parkingSpot);

            // Publish event instead of direct service call
            eventPublisher.publishEvent(new ParkingSpotUpdateEvent(this, savedParkingSpot.getId(),
                    savedParkingSpot.isAvailable(), "CREATE"));

            log.info("Successfully created parking spot with ID: {}", savedParkingSpot.getId());
            return convertToDTO(savedParkingSpot);
        } catch (Exception e) {
            log.error("Failed to create parking spot at address: {}", parkingSpotDTO.getAddress(), e);
            throw e;
        }
    }

    @Override
    public ParkingSpotDTO updateParkingSpot(Long id, ParkingSpotDTO parkingSpotDTO) {
        log.info("Updating parking spot with ID: {}", id);

        try {
            ParkingSpot existingParkingSpot = repository.findById(id)
                    .orElseThrow(() -> {
                        log.error("Parking spot not found for update with ID: {}", id);
                        return new ResourceNotFoundException(ENTITY_NAME, FIELD_ID, id);
                    });

            existingParkingSpot.setAddress(parkingSpotDTO.getAddress());
            existingParkingSpot.setLatitude(parkingSpotDTO.getLatitude());
            existingParkingSpot.setLongitude(parkingSpotDTO.getLongitude());
            existingParkingSpot.setLocation(geometryUtil.createPoint(parkingSpotDTO.getLongitude(), parkingSpotDTO.getLatitude()));
            existingParkingSpot.setAvailable(parkingSpotDTO.isAvailable());
            existingParkingSpot.setPrice(parkingSpotDTO.getPrice());
            existingParkingSpot.setRestrictions(parkingSpotDTO.getRestrictions());

            ParkingSpot updatedParkingSpot = repository.save(existingParkingSpot);

            // Publish event instead of direct service call
            eventPublisher.publishEvent(new ParkingSpotUpdateEvent(this, updatedParkingSpot.getId(),
                    updatedParkingSpot.isAvailable(), "UPDATE"));

            log.info("Successfully updated parking spot with ID: {}", id);
            return convertToDTO(updatedParkingSpot);
        } catch (Exception e) {
            log.error("Failed to update parking spot with ID: {}", id, e);
            throw e;
        }
    }

    @Override
    public void deleteParkingSpot(Long id) {
        log.info("Deleting parking spot with ID: {}", id);

        if (!repository.existsById(id)) {
            log.error("Parking spot not found for deletion with ID: {}", id);
            throw new ResourceNotFoundException(ENTITY_NAME, FIELD_ID, id);
        }

        try {
            repository.deleteById(id);

            // Publish event for deletion
            eventPublisher.publishEvent(new ParkingSpotUpdateEvent(this, id, false, "DELETE"));

            log.info("Successfully deleted parking spot with ID: {}", id);
        } catch (Exception e) {
            log.error("Failed to delete parking spot with ID: {}", id, e);
            throw e;
        }
    }

    @Override
    public ParkingSpotDTO updateSpotAvailability(Long id, boolean available) {
        log.info("Updating availability of parking spot ID {} to: {}", id, available);

        try {
            ParkingSpot parkingSpot = repository.findById(id)
                    .orElseThrow(() -> {
                        log.error("Parking spot not found for availability update with ID: {}", id);
                        return new ResourceNotFoundException(ENTITY_NAME, FIELD_ID, id);
                    });

            parkingSpot.setAvailable(available);
            ParkingSpot updatedSpot = repository.save(parkingSpot);

            // Publish event for availability update
            eventPublisher.publishEvent(new ParkingSpotUpdateEvent(this, id, available, "AVAILABILITY_UPDATE"));

            log.info("Successfully updated availability of parking spot ID: {}", id);
            return convertToDTO(updatedSpot);
        } catch (Exception e) {
            log.error("Failed to update availability of parking spot ID: {}", id, e);
            throw e;
        }
    }

    // Helper methods for DTO conversion
    private ParkingSpotDTO convertToDTO(ParkingSpot parkingSpot) {
        ParkingSpotDTO dto = new ParkingSpotDTO();
        dto.setId(parkingSpot.getId());
        dto.setAddress(parkingSpot.getAddress());
        dto.setLatitude(parkingSpot.getLatitude());
        dto.setLongitude(parkingSpot.getLongitude());
        dto.setAvailable(parkingSpot.isAvailable());
        dto.setPrice(parkingSpot.getPrice());
        dto.setRestrictions(parkingSpot.getRestrictions());
        return dto;
    }

    private ParkingSpot convertToEntity(ParkingSpotDTO dto) {
        ParkingSpot entity = new ParkingSpot();
        entity.setId(dto.getId());
        entity.setAddress(dto.getAddress());
        entity.setLatitude(dto.getLatitude());
        entity.setLongitude(dto.getLongitude());
        entity.setAvailable(dto.isAvailable());
        entity.setPrice(dto.getPrice());
        entity.setRestrictions(dto.getRestrictions());
        return entity;
    }
}
