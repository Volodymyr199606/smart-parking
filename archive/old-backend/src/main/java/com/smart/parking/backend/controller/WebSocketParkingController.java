package com.smart.parking.backend.controller;

import lombok.RequiredArgsConstructor;
import com.smart.parking.backend.dto.ParkingSpotDTO;
import com.smart.parking.backend.dto.ParkingSpotUpdateMessage;
import com.smart.parking.backend.service.ParkingSpotService;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

import java.util.List;

@Controller
@RequiredArgsConstructor
public class WebSocketParkingController {

    private final ParkingSpotService parkingSpotService;

    @MessageMapping("/spots")
    @SendTo("/topic/parking-spots")
    public List<ParkingSpotDTO> sendParkingSpots() {
        return parkingSpotService.getAllParkingSpots();
    }

    @MessageMapping("/update")
    @SendTo("/topic/parking-updates")
    public ParkingSpotUpdateMessage updateParkingSpot(ParkingSpotDTO spotDTO) {
        ParkingSpotDTO updatedSpot = parkingSpotService.updateParkingSpot(spotDTO.getId(), spotDTO);
        return new ParkingSpotUpdateMessage("UPDATE", updatedSpot);
    }
}