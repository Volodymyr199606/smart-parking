package com.smart.parking.backend.config;

import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * Resolves Render PostgreSQL URLs for runtimes (e.g. Docker) that cannot resolve private
 * {@code dpg-...-a} hostnames. Used from {@code EnvironmentPostProcessor} and DataSourceConfig.
 */
public final class RenderPostgresUrlSupport {

    private static final String PREFIX = "jdbc:postgresql://";
    private static final String PG_URI_PREFIX = "postgresql://";

    private RenderPostgresUrlSupport() {
    }

    public record PgDataSourceFix(String jdbcUrl, String overrideUsername, String overridePassword) {
    }

    /**
     * Full normalization: postgresql:// or jdbc:postgresql, expand Render internal host, append ssl to cloud URLs.
     */
    public static PgDataSourceFix buildFixFromAnyPostgresForm(String url) {
        if (!StringUtils.hasText(url)) {
            return null;
        }
        String trimmed = url.trim();
        if (trimmed.startsWith("postgres://")) {
            trimmed = PG_URI_PREFIX + trimmed.substring("postgres://".length());
        }
        if (trimmed.startsWith(PG_URI_PREFIX) && !trimmed.startsWith("jdbc:")) {
            return fromPostgresqlUri(trimmed);
        }
        if (trimmed.startsWith(PREFIX)) {
            return fromJdbcUrl(trimmed);
        }
        return null;
    }

    private static PgDataSourceFix fromPostgresqlUri(String original) {
        try {
            URI uri = URI.create(original);
            String userInfo = uri.getRawUserInfo();
            String username = null;
            String password = null;
            if (StringUtils.hasText(userInfo)) {
                int colon = userInfo.indexOf(':');
                if (colon > 0) {
                    username = URLDecoder.decode(userInfo.substring(0, colon), StandardCharsets.UTF_8);
                    password = URLDecoder.decode(userInfo.substring(colon + 1), StandardCharsets.UTF_8);
                } else {
                    username = URLDecoder.decode(userInfo, StandardCharsets.UTF_8);
                }
            }
            String host = uri.getHost();
            if (!StringUtils.hasText(host)) {
                return null;
            }
            host = expandRenderPostgresHost(host);
            int port = uri.getPort() == -1 ? 5432 : uri.getPort();
            String path = uri.getPath();
            if (path.startsWith("/")) {
                path = path.substring(1);
            }
            if (!StringUtils.hasText(path)) {
                return null;
            }
            String query = uri.getRawQuery();
            String jdbc = String.format("jdbc:postgresql://%s:%d/%s", host, port, path);
            if (StringUtils.hasText(query)) {
                jdbc += "?" + query;
            }
            return mergeEnvCredentialsIntoFix(ensureSslForRenderCloud(jdbc), username, password);
        } catch (Exception e) {
            return null;
        }
    }

    private static PgDataSourceFix fromJdbcUrl(String jdbcUrl) {
        int prefixLen = PREFIX.length();
        int pathStart = jdbcUrl.indexOf('/', prefixLen);
        if (pathStart < 0) {
            return mergeEnvCredentialsIntoFix(
                    ensureSslForRenderCloud(expandHostInJdbc(jdbcUrl, prefixLen, jdbcUrl.length())), null, null);
        }
        String withHost = expandHostInJdbc(jdbcUrl, prefixLen, pathStart);
        return mergeEnvCredentialsIntoFix(ensureSslForRenderCloud(withHost), null, null);
    }

    /**
     * Fills missing user/pass from {@code SPRING_DATASOURCE_USERNAME} / {@code SPRING_DATASOURCE_PASSWORD}.
     * If both are set, they take precedence (same as Render "linked" override behavior).
     */
    static PgDataSourceFix mergeEnvCredentialsIntoFix(String jdbc, String username, String password) {
        String envU = System.getenv("SPRING_DATASOURCE_USERNAME");
        String envP = System.getenv("SPRING_DATASOURCE_PASSWORD");
        String u = username;
        String p = password;
        if (StringUtils.hasText(envU) && StringUtils.hasText(envP)) {
            u = envU.trim();
            p = envP.trim();
        } else {
            if (!StringUtils.hasText(u) && StringUtils.hasText(envU)) {
                u = envU.trim();
            }
            if (!StringUtils.hasText(p) && StringUtils.hasText(envP)) {
                p = envP.trim();
            }
        }
        return new PgDataSourceFix(jdbc, u, p);
    }

    private static String expandHostInJdbc(String jdbcUrl, int prefixLen, int pathStart) {
        String authority = jdbcUrl.substring(prefixLen, pathStart);
        String pathSuffix = jdbcUrl.substring(pathStart);
        int port = 5432;
        String host;
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
        String expanded = expandRenderPostgresHost(host);
        if (expanded.equals(host)) {
            return jdbcUrl;
        }
        return PREFIX + expanded + ":" + port + pathSuffix;
    }

    public static String expandRenderPostgresHost(String host) {
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
        return host + "." + region + "-postgres.render.com";
    }

    public static String ensureSslForRenderCloud(String jdbcUrl) {
        if (jdbcUrl == null || !jdbcUrl.startsWith(PREFIX)) {
            return jdbcUrl;
        }
        if (jdbcUrl.contains("sslmode=") || jdbcUrl.contains("ssl=true")) {
            return jdbcUrl;
        }
        String lower = jdbcUrl.toLowerCase();
        if (lower.contains("localhost") || lower.contains("127.0.0.1")) {
            return jdbcUrl;
        }
        boolean needSsl = lower.contains("render.com")
                || lower.contains("supabase.co")
                || lower.contains("neon.tech")
                || lower.contains("amazonaws.com")
                || lower.contains("azure.com");
        if (!needSsl) {
            return jdbcUrl;
        }
        return jdbcUrl + (jdbcUrl.contains("?") ? "&" : "?") + "sslmode=require";
    }
}
