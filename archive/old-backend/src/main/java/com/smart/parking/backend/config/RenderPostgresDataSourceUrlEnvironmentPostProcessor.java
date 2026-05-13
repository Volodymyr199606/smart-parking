package com.smart.parking.backend.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;

/**
 * @see RenderPostgresDataSourcePatcher for the actual logic (also registered from
 * {@code ApplicationEnvironmentPreparedEvent} in {@code SmartParkingApplication}).
 */
public class RenderPostgresDataSourceUrlEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        RenderPostgresDataSourcePatcher.applyToEnvironment(environment);
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
