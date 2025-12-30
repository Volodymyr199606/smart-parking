# Deployment Guide - Render

This guide will help you deploy the Smart Parking application to Render.

## Architecture

- **Frontend**: Vercel (Next.js)
- **Backend**: Render (Spring Boot)
- **Database**: Render PostgreSQL (free tier)

## Prerequisites

1. GitHub account with your code pushed to a repository
2. Render account (sign up at [render.com](https://render.com))
3. Vercel account (sign up at [vercel.com](https://vercel.com))

## Step 1: Deploy Database on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name**: `smart-parking-db`
   - **Database**: `smart_parking`
   - **User**: `smart_parking_user`
   - **Region**: Choose closest to you
   - **Plan**: Free
4. Click **"Create Database"**
5. **Save the connection details** (you'll need them later)

### Note: Render uses PostgreSQL, not MySQL

Since Render's free tier uses PostgreSQL, you have two options:

**Option A: Use PostgreSQL (Recommended)**
- Update your Spring Boot app to use PostgreSQL
- Change dependency in `pom.xml` from MySQL to PostgreSQL
- Update Hibernate dialect

**Option B: Use External MySQL**
- Use PlanetScale, Aiven, or Railway for MySQL
- Update connection string in environment variables

## Step 2: Deploy Backend on Render

### Option A: Using render.yaml (Recommended)

1. Make sure `render.yaml` is in your repository root
2. Go to Render Dashboard → **"New +"** → **"Blueprint"**
3. Connect your GitHub repository
4. Render will detect `render.yaml` and create services automatically
5. Review and click **"Apply"**

### Option B: Manual Setup

1. Go to Render Dashboard → **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `smart-parking-backend`
   - **Environment**: `Java`
   - **Build Command**: `mvn clean package -DskipTests`
   - **Start Command**: `java -jar target/backend-0.0.1-SNAPSHOT.jar`
   - **Plan**: Free
4. Add Environment Variables:
   ```
   SPRING_PROFILES_ACTIVE=production
   SPRING_DATASOURCE_URL=<from database service>
   SPRING_DATASOURCE_USERNAME=<from database service>
   SPRING_DATASOURCE_PASSWORD=<from database service>
   JWT_SECRET=<generate a strong random string>
   JWT_EXPIRATION=86400
   SPRING_JPA_HIBERNATE_DDL_AUTO=update
   SERVER_PORT=10000
   ```
5. Click **"Create Web Service"**

### Important: Update for PostgreSQL

If using Render's PostgreSQL, update `pom.xml`:

```xml
<!-- Replace MySQL connector with PostgreSQL -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>
```

And update `application-production.properties`:
```properties
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
```

## Step 3: Update CORS Configuration

Update `SecurityConfig.java` to include your Render backend URL:

```java
configuration.setAllowedOrigins(Arrays.asList(
    "http://localhost:3000",
    "https://your-frontend.vercel.app",
    "https://smart-parking-backend.onrender.com" // Your Render URL
));
```

## Step 4: Deploy Frontend on Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
5. Add Environment Variable:
   ```
   NEXT_PUBLIC_API_URL=https://smart-parking-backend.onrender.com
   ```
6. Click **"Deploy"**

## Step 5: Update Frontend API URL

After deployment, update your frontend environment variable:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Update `NEXT_PUBLIC_API_URL` to your Render backend URL
3. Redeploy if needed

## Environment Variables Reference

### Backend (Render)

| Variable | Value | Description |
|----------|-------|-------------|
| `SPRING_PROFILES_ACTIVE` | `production` | Activates production profile |
| `SPRING_DATASOURCE_URL` | Auto-set | Database connection string |
| `SPRING_DATASOURCE_USERNAME` | Auto-set | Database username |
| `SPRING_DATASOURCE_PASSWORD` | Auto-set | Database password |
| `JWT_SECRET` | Random string | Secret key for JWT tokens |
| `JWT_EXPIRATION` | `86400` | Token expiration in seconds |
| `SPRING_JPA_HIBERNATE_DDL_AUTO` | `update` | Auto-update database schema |
| `SERVER_PORT` | `10000` | Server port (Render default) |

### Frontend (Vercel)

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | Your Render URL | Backend API endpoint |

## Troubleshooting

### Backend won't start
- Check build logs in Render dashboard
- Verify Java version (should be 21)
- Check if `target/backend-0.0.1-SNAPSHOT.jar` exists after build

### Database connection errors
- Verify database is running
- Check connection string format
- Ensure database credentials are correct

### CORS errors
- Update `SecurityConfig.java` with your frontend URL
- Check that CORS is enabled in backend

### Frontend can't connect to backend
- Verify `NEXT_PUBLIC_API_URL` is set correctly
- Check backend is running (Render dashboard)
- Verify backend URL is accessible

## Free Tier Limitations

### Render
- **Spins down after 15 minutes of inactivity** (free tier)
- First request after spin-down takes ~30-60 seconds
- 750 hours/month free
- PostgreSQL: 90 days retention

### Vercel
- Unlimited deployments
- 100GB bandwidth/month
- No spin-down issues

## Production Checklist

- [ ] Database deployed and running
- [ ] Backend deployed and accessible
- [ ] Frontend deployed and accessible
- [ ] Environment variables configured
- [ ] CORS updated with production URLs
- [ ] JWT_SECRET is strong and secure
- [ ] Database migrations run successfully
- [ ] Test user registration/login
- [ ] Test parking spot creation/retrieval

## Support

- Render Docs: https://render.com/docs
- Vercel Docs: https://vercel.com/docs
- Spring Boot Docs: https://spring.io/projects/spring-boot

