package com.smart.parking.backend.config;

import org.hibernate.cfg.AvailableSettings;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.util.StringUtils;

import java.util.Map;

@Configuration
@Profile("production")
public class JpaConfig {

    private final Environment environment;

    public JpaConfig(Environment environment) {
        this.environment = environment;
    }

    /**
     * Customizes Hibernate properties to auto-detect dialect from datasource URL
     */
    @Bean
    public HibernatePropertiesCustomizer hibernatePropertiesCustomizer() {
        return (Map<String, Object> hibernateProperties) -> {
            // Patcher / env can set any of these; use first non-blank
            String datasourceUrl = firstNonEmpty(
                    environment.getProperty("spring.datasource.url"),
                    environment.getProperty("spring.datasource.hikari.jdbc-url"),
                    environment.getProperty("jakarta.persistence.jdbc.url"),
                    environment.getProperty("hibernate.connection.url"));
            if (datasourceUrl != null) {
                String dialect = detectDialectFromUrl(datasourceUrl);
                if (dialect != null) {
                    hibernateProperties.put(AvailableSettings.DIALECT, dialect);
                }
            }
        };
    }

    private static String firstNonEmpty(String... v) {
        if (v == null) {
            return null;
        }
        for (String s : v) {
            if (StringUtils.hasText(s) && !s.contains("${")) {
                return s;
            }
        }
        return null;
    }
    
    /**
     * Detects the appropriate Hibernate dialect from the database URL
     */
    private String detectDialectFromUrl(String url) {
        if (url == null) {
            return null;
        }
        String t = url.trim();
        if (t.regionMatches(true, 0, "jdbc:mysql://", 0, "jdbc:mysql://".length())
                || t.regionMatches(true, 0, "jdbc:mariadb://", 0, "jdbc:mariadb://".length())) {
            return "org.hibernate.dialect.MySQLDialect";
        }
        if (t.regionMatches(true, 0, "jdbc:postgresql://", 0, "jdbc:postgresql://".length())
                || t.regionMatches(true, 0, "postgresql://", 0, "postgresql://".length())
                || t.regionMatches(true, 0, "postgres://", 0, "postgres://".length())) {
            return "org.hibernate.dialect.PostgreSQLDialect";
        }
        return null;
    }
}
