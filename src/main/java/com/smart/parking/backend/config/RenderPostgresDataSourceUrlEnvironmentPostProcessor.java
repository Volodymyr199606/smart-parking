package com.smart.parking.backend.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.util.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.Map;

/**
 * Runs before any beans. Patches {@code spring.datasource.url} so Render internal {@code dpg-...-a}
 * hostnames become public {@code .render.com} hostnames. Fixes Docker/unknown-host issues where
 * {@code DataSource} beans load too late for Hibernate metadata.
 */
public class RenderPostgresDataSourceUrlEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    private static final Logger log = LoggerFactory.getLogger(RenderPostgresDataSourceUrlEnvironmentPostProcessor.class);

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String raw = firstNonEmpty(
                environment.getProperty("spring.datasource.url"),
                System.getenv("SPRING_DATASOURCE_URL"),
                System.getenv("DATABASE_URL"));
        if (!StringUtils.hasText(raw)) {
            return;
        }
        RenderPostgresUrlSupport.PgDataSourceFix fix = RenderPostgresUrlSupport.buildFixFromAnyPostgresForm(raw);
        if (fix == null) {
            return;
        }
        String effectiveBefore = firstNonEmpty(
                environment.getProperty("spring.datasource.url"), raw, null);
        boolean urlDiffers = !fix.jdbcUrl().equals(effectiveBefore != null ? effectiveBefore.trim() : "");
        boolean creds = needsCredentialOverride(environment, fix);
        if (!urlDiffers && !creds) {
            return;
        }
        Map<String, Object> map = new HashMap<>();
        map.put("spring.datasource.url", fix.jdbcUrl());
        if (needsUsernameOverride(environment, fix)) {
            map.put("spring.datasource.username", fix.overrideUsername());
        }
        if (needsPasswordOverride(environment, fix)) {
            map.put("spring.datasource.password", fix.overridePassword());
        }
        environment.getPropertySources()
                .addFirst(new MapPropertySource("renderPostgresPatchedDataSource", map));
        log.info(
                "Patched DataSource URL for Render/Docker: internal Postgres hostname expanded and/or SSL parameters applied. "
                        + "Set RENDER_POSTGRES_HOST to override the hostname if needed.");
    }

    private static boolean needsCredentialOverride(ConfigurableEnvironment environment, RenderPostgresUrlSupport.PgDataSourceFix fix) {
        return needsUsernameOverride(environment, fix) || needsPasswordOverride(environment, fix);
    }

    private static boolean needsUsernameOverride(
            ConfigurableEnvironment environment, RenderPostgresUrlSupport.PgDataSourceFix fix) {
        return StringUtils.hasText(fix.overrideUsername())
                && !StringUtils.hasText(environment.getProperty("spring.datasource.username"));
    }

    private static boolean needsPasswordOverride(
            ConfigurableEnvironment environment, RenderPostgresUrlSupport.PgDataSourceFix fix) {
        return StringUtils.hasText(fix.overridePassword())
                && !StringUtils.hasText(environment.getProperty("spring.datasource.password"));
    }

    @Override
    public int getOrder() {
        // Run after other EPPs so ${...} in application-*.properties is fully resolved
        return Ordered.LOWEST_PRECEDENCE;
    }

    private static String firstNonEmpty(String a, String b, String c) {
        if (StringUtils.hasText(a)) {
            return a;
        }
        if (StringUtils.hasText(b)) {
            return b;
        }
        if (StringUtils.hasText(c)) {
            return c;
        }
        return null;
    }
}
