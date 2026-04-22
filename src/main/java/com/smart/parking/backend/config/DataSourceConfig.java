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

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

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
                host = resolveRenderPostgresHostname(host);
                int port = uri.getPort() == -1 ? 5432 : uri.getPort();
                String path = uri.getPath();
                if (path.startsWith("/")) {
                    path = path.substring(1);
                }
                if (!StringUtils.hasText(path)) {
                    throw new RuntimeException("PostgreSQL URL has no database name: " + redactPassword(url));
                }

                String query = uri.getRawQuery();
                url = String.format("jdbc:postgresql://%s:%d/%s", host, port, path);
                if (StringUtils.hasText(query)) {
                    url += "?" + query;
                }
                properties.setUrl(url);
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException("Failed to convert PostgreSQL URI to JDBC URL: " + redactPassword(url), e);
            }
        }

        String jdbcUrl = properties.getUrl();
        jdbcUrl = rewriteJdbcPostgresHostIfRenderInternal(jdbcUrl);
        jdbcUrl = ensurePostgresSslForCloudHosts(jdbcUrl);
        properties.setUrl(jdbcUrl);

        String driverClassName = detectDriverFromUrl(jdbcUrl);
        if (driverClassName != null) {
            properties.setDriverClassName(driverClassName);
        }

        return properties.initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
    }

    /**
     * Render's linked {@code DATABASE_URL} often uses a private hostname like {@code dpg-xxxxx-a}
     * with no domain. That only resolves on Render's private network; Docker web services typically
     * need the public hostname {@code dpg-xxxxx-a.&lt;region&gt;-postgres.render.com}.
     */
    private static String resolveRenderPostgresHostname(String host) {
        if (!StringUtils.hasText(host) || host.contains(".")) {
            return host;
        }
        if (!host.startsWith("dpg-")) {
            return host;
        }
        String explicit = System.getenv("RENDER_POSTGRES_HOST");
        if (StringUtils.hasText(explicit)) {
            return explicit.trim();
        }
        String pgHost = System.getenv("PGHOST");
        if (StringUtils.hasText(pgHost) && pgHost.contains(".") && pgHost.startsWith("dpg-")) {
            return pgHost.trim();
        }
        String region = System.getenv("RENDER_REGION");
        if (!StringUtils.hasText(region)) {
            region = "oregon";
        }
        region = region.trim().toLowerCase().replace('_', '-');
        String full = host + "." + region + "-postgres.render.com";
        log.warn(
                "PostgreSQL host '{}' is a Render internal hostname (no public DNS from Docker). "
                        + "Using '{}'. Override with env RENDER_POSTGRES_HOST if needed; RENDER_REGION is '{}'.",
                host,
                full,
                region);
        return full;
    }

    /**
     * Fix JDBC URLs that still use a short internal Render hostname (e.g. when SPRING_DATASOURCE_URL
     * is already {@code jdbc:postgresql://...}).
     */
    private static String rewriteJdbcPostgresHostIfRenderInternal(String jdbcUrl) {
        if (jdbcUrl == null || !jdbcUrl.startsWith("jdbc:postgresql://")) {
            return jdbcUrl;
        }
        int prefixLen = "jdbc:postgresql://".length();
        int pathStart = jdbcUrl.indexOf('/', prefixLen);
        if (pathStart < 0) {
            return jdbcUrl;
        }
        String authority = jdbcUrl.substring(prefixLen, pathStart);
        String pathSuffix = jdbcUrl.substring(pathStart);
        String host;
        int port = 5432;
        int colon = authority.lastIndexOf(':');
        if (colon > 0 && authority.substring(colon + 1).matches("\\d+")) {
            host = authority.substring(0, colon);
            port = Integer.parseInt(authority.substring(colon + 1));
        } else {
            host = authority;
        }
        if (!StringUtils.hasText(host) || host.contains(".") || !host.startsWith("dpg-")) {
            return jdbcUrl;
        }
        String resolved = resolveRenderPostgresHostname(host);
        if (resolved.equals(host)) {
            return jdbcUrl;
        }
        return "jdbc:postgresql://" + resolved + ":" + port + pathSuffix;
    }

    /**
     * Render (and many managed Postgres providers) require TLS. Without sslmode=require the driver
     * often fails with "connection attempt failed" during Hibernate startup.
     */
    private String ensurePostgresSslForCloudHosts(String jdbcUrl) {
        if (jdbcUrl == null || !jdbcUrl.startsWith("jdbc:postgresql://")) {
            return jdbcUrl;
        }
        if (jdbcUrl.contains("sslmode=") || jdbcUrl.contains("ssl=true")) {
            return jdbcUrl;
        }
        String lower = jdbcUrl.toLowerCase();
        if (lower.contains("localhost") || lower.contains("127.0.0.1")) {
            return jdbcUrl;
        }
        boolean managedCloud = lower.contains("render.com")
                || lower.contains("supabase.co")
                || lower.contains("neon.tech")
                || lower.contains("amazonaws.com")
                || lower.contains("azure.com");
        if (!managedCloud) {
            return jdbcUrl;
        }
        return jdbcUrl + (jdbcUrl.contains("?") ? "&" : "?") + "sslmode=require";
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
