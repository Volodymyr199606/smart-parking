# PostgreSQL Local Setup Guide

This guide will help you set up PostgreSQL with PostGIS extension locally for the Smart Parking project.

## Step 1: Install PostgreSQL with PostGIS

### Windows

1. **Download PostgreSQL:**
   - Go to https://www.postgresql.org/download/windows/
   - Download the installer from EnterpriseDB
   - Or use the official installer from postgresql.org

2. **Install PostgreSQL:**
   - Run the installer
   - Choose installation directory (default: `C:\Program Files\PostgreSQL\16`)
   - **Important:** During installation, make sure to check "PostGIS" in the component selection
   - Set a password for the `postgres` superuser (remember this password!)
   - Port: 5432 (default)

3. **Verify Installation:**
   ```powershell
   psql --version
   ```

### macOS

**Using Homebrew (Recommended):**
```bash
# Install PostgreSQL with PostGIS
brew install postgresql@16 postgis

# Start PostgreSQL service
brew services start postgresql@16

# Create database
createdb smart_parking
```

**Or download from:**
- https://postgresapp.com/ (includes PostGIS)

### Linux (Ubuntu/Debian)

```bash
# Install PostgreSQL and PostGIS
sudo apt update
sudo apt install postgresql postgresql-contrib postgis postgresql-16-postgis-3

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

## Step 2: Create Database and Enable PostGIS

1. **Open PostgreSQL Command Line:**
   - Windows: Open "SQL Shell (psql)" from Start Menu, or use Command Prompt:
     ```powershell
     psql -U postgres
     ```
   - macOS/Linux:
     ```bash
     sudo -u postgres psql
     # or
     psql -U postgres
     ```

2. **Create Database:**
   ```sql
   CREATE DATABASE smart_parking;
   ```

3. **Connect to the Database:**
   ```sql
   \c smart_parking
   ```

4. **Enable PostGIS Extension:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

5. **Verify PostGIS Installation:**
   ```sql
   SELECT PostGIS_version();
   ```
   You should see the PostGIS version number.

6. **Exit psql:**
   ```sql
   \q
   ```

## Step 3: Configure Spring Boot Application

1. **Create `application.properties` file:**
   Create `src/main/resources/application.properties` with the following content:

```properties
# PostgreSQL Database Configuration
spring.datasource.url=jdbc:postgresql://localhost:5432/smart_parking
spring.datasource.username=postgres
spring.datasource.password=YOUR_POSTGRES_PASSWORD
spring.datasource.driver-class-name=org.postgresql.Driver

# JPA/Hibernate Configuration
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
spring.jpa.properties.hibernate.format_sql=true

# Server Configuration
server.port=8080

# JWT Configuration
jwt.secret=your-secret-key-change-this-in-production-minimum-32-characters-long
jwt.expiration=86400

# Logging
logging.level.root=INFO
logging.level.com.smart.parking=DEBUG
```

2. **Replace `YOUR_POSTGRES_PASSWORD`** with the password you set during PostgreSQL installation.

3. **Replace `jwt.secret`** with a secure random string (minimum 32 characters). You can generate one:
   ```powershell
   # Windows PowerShell
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
   ```
   ```bash
   # macOS/Linux
   openssl rand -base64 32
   ```

## Step 4: Verify pom.xml

Your `pom.xml` should already have PostgreSQL dependency. Verify it includes:

```xml
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>

<dependency>
    <groupId>org.hibernate</groupId>
    <artifactId>hibernate-spatial</artifactId>
    <version>${hibernate.version}</version>
</dependency>
```

## Step 5: Test the Setup

1. **Start the Spring Boot application:**
   ```bash
   mvn spring-boot:run
   ```

2. **Check the logs** - You should see:
   - Database connection successful
   - Hibernate creating/updating tables
   - No PostGIS errors

3. **Test the API:**
   - Open http://localhost:8080/api/auth/register
   - Try registering a user
   - The database tables should be created automatically

4. **Verify PostGIS is working:**
   - Connect to your database:
     ```bash
     psql -U postgres -d smart_parking
     ```
   - Check if PostGIS extension is enabled:
     ```sql
     \dx
     ```
   - You should see `postgis` in the list

## Troubleshooting

### "Connection refused" error
- Make sure PostgreSQL is running:
  - Windows: Check Services (services.msc) for "postgresql-x64-16"
  - macOS: `brew services list`
  - Linux: `sudo systemctl status postgresql`

### "PostGIS extension not found"
- Install PostGIS package for your system
- Make sure you enabled it in the database: `CREATE EXTENSION postgis;`

### "Password authentication failed"
- Check your password in `application.properties`
- Try resetting PostgreSQL password:
  ```sql
  ALTER USER postgres PASSWORD 'your_new_password';
  ```

### "Database does not exist"
- Create it: `CREATE DATABASE smart_parking;`
- Make sure you're connecting to the right database name

### Connection URL issues
- Default PostgreSQL port is 5432
- Format: `jdbc:postgresql://localhost:5432/database_name`

## Quick Reference

**Start PostgreSQL (macOS/Linux):**
```bash
brew services start postgresql@16  # macOS
sudo systemctl start postgresql    # Linux
```

**Connect to Database:**
```bash
psql -U postgres -d smart_parking
```

**Check PostGIS Version:**
```sql
SELECT PostGIS_version();
```

**List All Extensions:**
```sql
\dx
```

**Drop and Recreate Database (if needed):**
```sql
DROP DATABASE smart_parking;
CREATE DATABASE smart_parking;
\c smart_parking
CREATE EXTENSION IF NOT EXISTS postgis;
```

