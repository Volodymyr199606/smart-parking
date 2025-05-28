package com.curbside.parking.backend.event;

import lombok.Getter;
import org.springframework.context.ApplicationEvent;

@Getter
public class ParkingSpotUpdateEvent extends ApplicationEvent {
    private final Long spotId;
    private final boolean available;
    private final String updateType;

    public ParkingSpotUpdateEvent(Object source, Long spotId, boolean available, String updateType) {
        super(source);
        this.spotId = spotId;
        this.available = available;
        this.updateType = updateType;
    }
}