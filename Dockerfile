# Build stage with Java 21
FROM maven:3.9.6-eclipse-temurin-21 AS builder
WORKDIR /app
COPY . .
RUN mvn clean package -DskipTests

# Run stage with Java 21
FROM eclipse-temurin:21-jdk-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080
# Render uses PORT environment variable, Spring Boot will pick it up automatically
ENV PORT=10000
ENTRYPOINT ["java", "-jar", "app.jar"]
