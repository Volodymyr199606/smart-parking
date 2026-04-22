package com.smart.parking.backend;

import com.smart.parking.backend.config.RenderPostgresDataSourcePatcher;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication
@EntityScan(basePackages = "com.smart.parking.backend.model")
@EnableJpaRepositories(basePackages = "com.smart.parking.backend.repository")
public class SmartParkingApplication {

    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(SmartParkingApplication.class);
        app.addListeners((ApplicationListener<ApplicationEnvironmentPreparedEvent>) event -> {
            ConfigurableEnvironment environment = event.getEnvironment();
            RenderPostgresDataSourcePatcher.applyToEnvironment(environment);
        });
        app.run(args);
    }
}
