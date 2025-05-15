package com.curbside.parking.backend.dto;

public class ParkingSpotDTO {
    private String name;
    private double lat;
    private double lng;
    private String address;


    public ParkingSpotDTO(String name, double lat, double lng, String address) {
        this.name = name;
        this.lat = lat;
        this.lng = lng;
        this.address = address;
    }

}