package com.smart.parking.backend.config;

import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.util.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.Map;

/**
 * Patches DataSource / Hibernate to use a public Render {@code .render.com} hostname when
 * {@code DATABASE_URL} or {@code spring.datasource.url} still use the private {@code dpg-...-a} host.
 * Invoked from {@link RenderPostgresDataSourceUrlEnvironmentPostProcessor} and from
 * {@code ApplicationEnvironmentPreparedEvent} in {@code SmartParkingApplication} so a fix runs even
 * if SPI does not load or is ordered incorrectly.
 */
public final class RenderPostgresDataSourcePatcher {

    private static final Logger log = LoggerFactory.getLogger(RenderPostgresDataSourcePatcher.class);

    private static final String NAME = "renderPostgresDataSourcePatchedUrl";

    private RenderPostgresDataSourcePatcher() {
    }

    public static void applyToEnvironment(ConfigurableEnvironment environment) {
        String raw = resolveRawPostgresUrl(environment);
        if (!StringUtils.hasText(raw) || isUnresolvedPlaceholder(raw)) {
            return;
        }
        String normalized = normalizeJdbcPrefixForParsing(raw);
        RenderPostgresUrlSupport.PgDataSourceFix fix = RenderPostgresUrlSupport.buildFixFromAnyPostgresForm(normalized);
        if (fix == null) {
            if (raw.toLowerCase().contains("dpg-")) {
                log.warn("DATABASE_URL or spring.datasource.url uses dpg- host but could not be parsed; check URL format.");
            }
            return;
        }
        if (!shouldApplyPatch(environment, raw, fix)) {
            return;
        }
        Map<String, Object> map = new HashMap<>();
        String jdbc = fix.jdbcUrl();
        map.put("spring.datasource.url", jdbc);
        if (needsUsername(environment, fix)) {
            map.put("spring.datasource.username", fix.overrideUsername());
        }
        if (needsPassword(environment, fix)) {
            map.put("spring.datasource.password", fix.overridePassword());
        }
        map.put("spring.datasource.hikari.jdbc-url", jdbc);
        // Do not set jakarta.persistence.jdbc.* or hibernate.connection.* here. If username comes from
        // env and password was only in the URL, Hibernate could see user without password and use
        // DriverManager with no password. The DataSource (Hikari) built from spring.datasource.* is the
        // single source of truth for JPA in Spring Boot.
        addOrReplace(environment, map);
        log.info("Render PostgreSQL connection URL was patched to use a resolvable .render.com hostname (Docker / UnknownHost dpg-...).");
    }

    private static void addOrReplace(ConfigurableEnvironment environment, Map<String, Object> map) {
        org.springframework.core.env.MutablePropertySources ps = environment.getPropertySources();
        if (ps.get(NAME) != null) {
            ps.remove(NAME);
        }
        ps.addFirst(new MapPropertySource(NAME, map));
    }

    private static boolean isUnresolvedPlaceholder(String value) {
        return value != null && value.contains("${");
    }

    private static String resolveRawPostgresUrl(ConfigurableEnvironment environment) {
        String a = environment.getProperty("spring.datasource.url");
        if (isUnresolvedPlaceholder(a) || !StringUtils.hasText(a)) {
            a = firstEnv("SPRING_DATASOURCE_URL", "DATABASE_URL");
        }
        if (StringUtils.hasText(a) && !isUnresolvedPlaceholder(a)) {
            return a;
        }
        return firstEnv("SPRING_DATASOURCE_URL", "DATABASE_URL");
    }

    private static String firstEnv(String e1, String e2) {
        String a = System.getenv(e1);
        if (StringUtils.hasText(a)) {
            return a;
        }
        return System.getenv(e2);
    }

    private static String normalizeJdbcPrefixForParsing(String url) {
        if (url == null) {
            return null;
        }
        String t = url.trim();
        if (t.regionMatches(true, 0, "JDBC:POSTGRESQL://", 0, "JDBC:POSTGRESQL://".length())) {
            return "jdbc:postgresql://" + t.substring("JDBC:POSTGRESQL://".length());
        }
        if (t.regionMatches(true, 0, "POSTGRESQL://", 0, "POSTGRESQL://".length()) && !t.regionMatches(true, 0, "JDBC:", 0, 5)) {
            return "postgresql://" + t.substring("postgresql://".length());
        }
        if (t.regionMatches(true, 0, "POSTGRES://", 0, "POSTGRES://".length()) && !t.regionMatches(true, 0, "JDBC:", 0, 5)) {
            return "postgresql://" + t.substring("postgres://".length());
        }
        return t;
    }

    private static boolean shouldApplyPatch(
            ConfigurableEnvironment environment, String originalRaw, RenderPostgresUrlSupport.PgDataSourceFix fix) {
        String before = firstNonNullTrim(
                environment.getProperty("spring.datasource.url"),
                environment.getProperty("spring.datasource.hikari.jdbc-url"),
                originalRaw);
        if (needsOverrideForShortDpg(before) || needsOverrideForShortDpg(originalRaw) || !fix.jdbcUrl().equals(before)) {
            return true;
        }
        return needsUsername(environment, fix) || needsPassword(environment, fix);
    }

    private static String firstNonNullTrim(String a, String b, String c) {
        if (StringUtils.hasText(a) && !isUnresolvedPlaceholder(a)) {
            return a.trim();
        }
        if (StringUtils.hasText(b) && !isUnresolvedPlaceholder(b)) {
            return b.trim();
        }
        if (StringUtils.hasText(c)) {
            return c.trim();
        }
        return "";
    }

    private static boolean needsOverrideForShortDpg(String url) {
        if (!StringUtils.hasText(url) || isUnresolvedPlaceholder(url)) {
            return false;
        }
        String l = url.toLowerCase();
        return l.contains("dpg-") && !l.contains("render.com");
    }

    private static boolean needsUsername(ConfigurableEnvironment environment, RenderPostgresUrlSupport.PgDataSourceFix fix) {
        return StringUtils.hasText(fix.overrideUsername())
                && !StringUtils.hasText(environment.getProperty("spring.datasource.username"));
    }

    private static boolean needsPassword(ConfigurableEnvironment environment, RenderPostgresUrlSupport.PgDataSourceFix fix) {
        return StringUtils.hasText(fix.overridePassword())
                && !StringUtils.hasText(environment.getProperty("spring.datasource.password"));
    }
}
