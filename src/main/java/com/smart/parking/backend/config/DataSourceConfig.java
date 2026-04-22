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
