package com.smart.parking.backend.config;

import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

import javax.sql.DataSource;
import com.zaxxer.hikari.HikariDataSource;

import java.net.URI;

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
        
        // Convert PostgreSQL URI to JDBC URL if needed
        if (url != null && url.startsWith("postgresql://") && !url.startsWith("jdbc:")) {
            try {
                URI uri = new URI(url);
                String host = uri.getHost();
                int port = uri.getPort() == -1 ? 5432 : uri.getPort();
                String path = uri.getPath();
                if (path.startsWith("/")) {
                    path = path.substring(1);
                }
                
                // Convert to JDBC URL format
                url = String.format("jdbc:postgresql://%s:%d/%s", host, port, path);
                properties.setUrl(url);
            } catch (Exception e) {
                throw new RuntimeException("Failed to convert PostgreSQL URI to JDBC URL: " + url, e);
            }
        }
        
        return properties.initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
    }
}

