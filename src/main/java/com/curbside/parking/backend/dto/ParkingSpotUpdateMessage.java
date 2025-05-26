package com.curbside.parking.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ParkingSpotUpdateMessage {
    private String type;
    private ParkingSpotDTO parkingSpot;
}