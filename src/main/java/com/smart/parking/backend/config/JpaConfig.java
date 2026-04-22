package com.smart.parking.backend.config;

import org.hibernate.cfg.AvailableSettings;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

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
            // Get the datasource URL to determine the database type
            String datasourceUrl = environment.getProperty("spring.datasource.url");
            
            if (datasourceUrl != null) {
                String dialect = detectDialectFromUrl(datasourceUrl);
                if (dialect != null) {
                    hibernateProperties.put(AvailableSettings.DIALECT, dialect);
                }
            }
        };
    }
    
    /**
     * Detects the appropriate Hibernate dialect from the database URL
     */
    private String detectDialectFromUrl(String url) {
        if (url == null) {
            return null;
        }
        
        if (url.startsWith("jdbc:mysql://") || url.startsWith("jdbc:mariadb://")) {
            return "org.hibernate.dialect.MySQLDialect";
        } else if (url.startsWith("jdbc:postgresql://") || url.startsWith("postgresql://")) {
            return "org.hibernate.dialect.PostgreSQLDialect";
        }
        
        return null;
    }
}
