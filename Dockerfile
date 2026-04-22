# Build stage with Java 21
FROM maven:3.9.6-eclipse-temurin-21 AS builder
WORKDIR /app
COPY . .
RUN mvn clean package -DskipTests

# Run stage with Java 21
FROM eclipse-temurin:21-jdk-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar

# Render injects PORT at runtime; align with application-production defaults
EXPOSE 10000
ENV PORT=10000
# Without this, the default profile uses localhost DB and the container exits immediately on Render
ENV SPRING_PROFILES_ACTIVE=production
# Free-tier instances have little RAM; cap heap so the JVM does not get OOM-killed
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70.0 -XX:+ExitOnOutOfMemoryError"

ENTRYPOINT ["java", "-jar", "app.jar"]
