# Use Maven to build the application
FROM maven:3.9.3-amazoncorretto-17 AS builder
WORKDIR /app
COPY . .
RUN mvn clean package -DskipTests

# Use a lightweight JDK to run the app
FROM eclipse-temurin:17-jdk-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
