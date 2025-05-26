package com.curbside.parking.backend.listener;

import com.curbside.parking.backend.dto.ParkingSpotDTO;
import com.curbside.parking.backend.dto.ParkingSpotUpdateMessage;
import com.curbside.parking.backend.event.ParkingSpotUpdateEvent;
import com.curbside.parking.backend.service.ParkingSpotService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class ParkingSpotEventListener {

    private final SimpMessagingTemplate messagingTemplate;
    private final ParkingSpotService parkingSpotService;

    @EventListener
    public void handleParkingSpotUpdate(ParkingSpotUpdateEvent event) {
        log.info("Handling parking spot update event for spot ID: {}", event.getSpotId());

        try {
            ParkingSpotDTO spot = parkingSpotService.getParkingSpotById(event.getSpotId());
            ParkingSpotUpdateMessage message = new ParkingSpotUpdateMessage(event.getUpdateType(), spot);

            messagingTemplate.convertAndSend("/topic/parking-updates", message);
            log.debug("Broadcasted parking spot update for spot ID: {}", event.getSpotId());
        } catch (Exception e) {
            log.error("Failed to broadcast parking spot update for spot ID: {}", event.getSpotId(), e);
        }
    }
}