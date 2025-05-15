package com.curbside.parking.backend.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "parking_spots")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
@Data
public class ParkingSpot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private double latitude;

    private double longitude;

    private boolean available;

    private String address;

    private String name;


    @ManyToOne
    @JoinColumn(name = "user_id")
    private User user;
}