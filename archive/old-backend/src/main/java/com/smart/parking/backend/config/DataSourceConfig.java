package com.smart.parking.backend.config;

import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.util.StringUtils;
import lombok.extern.slf4j.Slf4j;

import javax.sql.DataSource;
import com.zaxxer.hikari.HikariDataSource;

@Configuration
@Profile("production")
@Slf4j
public class DataSourceConfig {

    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource")
    public DataSourceProperties dataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean
    @Primary
    public DataSource dataSource(DataSourceProperties properties) {
        String url = properties.getUrl();

        if (!StringUtils.hasText(url)) {
            throw new RuntimeException(
                    "Database URL is not configured. On Render, link a PostgreSQL database (sets DATABASE_URL) "
                            + "or set SPRING_DATASOURCE_URL.");
        }

        // Belt-and-suspenders: EPP also patches; idempotent
        RenderPostgresUrlSupport.PgDataSourceFix fix = RenderPostgresUrlSupport.buildFixFromAnyPostgresForm(url);
        if (fix != null) {
            if (StringUtils.hasText(fix.overrideUsername()) && !StringUtils.hasText(properties.getUsername())) {
                properties.setUsername(fix.overrideUsername());
            }
            if (StringUtils.hasText(fix.overridePassword()) && !StringUtils.hasText(properties.getPassword())) {
                properties.setPassword(fix.overridePassword());
            }
            properties.setUrl(fix.jdbcUrl());
        } else {
            log.warn("Could not parse database URL for Render PostgreSQL heuristics; using URL as provided.");
        }

        // JDBC URLs from Render often have no userinfo; credentials may live only in env vars
        applyRenderEnvCredentialsIfMissing(properties);
        requireCredentialsForCloudPostgres(properties);

        String jdbcUrl = properties.getUrl();
        if (StringUtils.hasText(jdbcUrl) && !jdbcUrl.startsWith("jdbc:") && jdbcUrl.contains("dpg-")) {
            // Raw URL in unexpected form — try again in case of odd formatting
            RenderPostgresUrlSupport.PgDataSourceFix again = RenderPostgresUrlSupport.buildFixFromAnyPostgresForm(jdbcUrl);
            if (again != null) {
                properties.setUrl(again.jdbcUrl());
            }
        }

        jdbcUrl = properties.getUrl();
        String driverClassName = detectDriverFromUrl(jdbcUrl);
        if (driverClassName != null) {
            properties.setDriverClassName(driverClassName);
        }

        return properties.initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
    }

    private void applyRenderEnvCredentialsIfMissing(DataSourceProperties properties) {
        if (!StringUtils.hasText(properties.getUsername())) {
            String u = System.getenv("SPRING_DATASOURCE_USERNAME");
            if (StringUtils.hasText(u)) {
                properties.setUsername(u.trim());
            }
        }
        if (!StringUtils.hasText(properties.getPassword())) {
            String p = System.getenv("SPRING_DATASOURCE_PASSWORD");
            if (StringUtils.hasText(p)) {
                properties.setPassword(p.trim());
            }
        }
    }

    /**
     * Fails fast with a clear message instead of Hibernate's DriverManager "no password" error.
     */
    private void requireCredentialsForCloudPostgres(DataSourceProperties properties) {
        String jdbcUrl = properties.getUrl();
        if (jdbcUrl == null) {
            return;
        }
        String lower = jdbcUrl.toLowerCase();
        if (lower.contains("localhost") || lower.contains("127.0.0.1")) {
            return;
        }
        if (!lower.contains("render.com")
                && !lower.contains("amazonaws.com")
                && !lower.contains("neon.tech")
                && !lower.contains("supabase.co")) {
            return;
        }
        if (!StringUtils.hasText(properties.getUsername()) || !StringUtils.hasText(properties.getPassword())) {
            throw new IllegalStateException(
                    "Database username/password are not set. Use a postgresql:// URL that includes credentials, "
                            + "or set SPRING_DATASOURCE_USERNAME and SPRING_DATASOURCE_PASSWORD in your hosting "
                            + "environment (Render Connect / linked database).");
        }
    }

    private String detectDriverFromUrl(String url) {
        if (url == null) {
            return null;
        }
        if (url.startsWith("jdbc:mysql://") || url.startsWith("jdbc:mariadb://")) {
            return "com.mysql.cj.jdbc.Driver";
        } else if (url.startsWith("jdbc:postgresql://") || url.startsWith("postgresql://")) {
            return "org.postgresql.Driver";
        }
        return null;
    }
}
