package com.smart.parking.backend.config;

import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.util.StringUtils;

import javax.sql.DataSource;
import com.zaxxer.hikari.HikariDataSource;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

@Configuration
@Profile("production")
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

        url = url.trim();
        if (url.startsWith("postgres://")) {
            url = "postgresql://" + url.substring("postgres://".length());
            properties.setUrl(url);
        }

        // Render DATABASE_URL is often postgresql://user:pass@host/db — extract credentials before JDBC conversion
        if (url.startsWith("postgresql://") && !url.startsWith("jdbc:")) {
            try {
                URI uri = URI.create(url);
                String userInfo = uri.getRawUserInfo();
                if (StringUtils.hasText(userInfo) && !StringUtils.hasText(properties.getUsername())) {
                    int colon = userInfo.indexOf(':');
                    if (colon > 0) {
                        properties.setUsername(
                                URLDecoder.decode(userInfo.substring(0, colon), StandardCharsets.UTF_8));
                        properties.setPassword(
                                URLDecoder.decode(userInfo.substring(colon + 1), StandardCharsets.UTF_8));
                    } else {
                        properties.setUsername(
                                URLDecoder.decode(userInfo, StandardCharsets.UTF_8));
                    }
                }

                String host = uri.getHost();
                if (!StringUtils.hasText(host)) {
                    throw new RuntimeException("PostgreSQL URL has no host: " + redactPassword(url));
                }
                int port = uri.getPort() == -1 ? 5432 : uri.getPort();
                String path = uri.getPath();
                if (path.startsWith("/")) {
                    path = path.substring(1);
                }
                if (!StringUtils.hasText(path)) {
                    throw new RuntimeException("PostgreSQL URL has no database name: " + redactPassword(url));
                }

                url = String.format("jdbc:postgresql://%s:%d/%s", host, port, path);
                properties.setUrl(url);
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException("Failed to convert PostgreSQL URI to JDBC URL: " + redactPassword(url), e);
            }
        }

        String jdbcUrl = properties.getUrl();
        String driverClassName = detectDriverFromUrl(jdbcUrl);
        if (driverClassName != null) {
            properties.setDriverClassName(driverClassName);
        }

        return properties.initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
    }

    private static String redactPassword(String url) {
        if (url == null) {
            return null;
        }
        return url.replaceAll("://([^:/@]+):([^@]+)@", "://$1:***@");
    }

    /**
     * Detects the appropriate JDBC driver from the database URL
     */
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
