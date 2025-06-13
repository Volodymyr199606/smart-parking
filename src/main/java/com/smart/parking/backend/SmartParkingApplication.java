package com.smart.parking.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication
@EntityScan("com.smart.parking.backend.model")
@EnableJpaRepositories("com.smart.parking.backend.repository")
public class SmartParkingApplication {
	public static void main(String[] args) {
		SpringApplication.run(SmartParkingApplication.class, args);
	}
}
