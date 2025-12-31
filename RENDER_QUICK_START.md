# Render Deployment - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Prepare Your Code

✅ **PostgreSQL Migration Already Complete!**

Your project has already been migrated to PostgreSQL:
- ✅ `pom.xml` - PostgreSQL driver configured
- ✅ `application-production.properties` - PostgreSQL/PostGIS dialect configured
- ✅ `ParkingSpotRepository.java` - Spatial queries updated for PostgreSQL
- ✅ `ParkingSpot.java` - Column definition updated for PostgreSQL

**Just commit and push to GitHub**:
   ```bash
   git add .
   git commit -m "Add Render deployment configuration with PostgreSQL"
   git push
   ```

### Step 2: Deploy Database on Render

1. Go to [render.com](https://render.com) and sign up/login
2. Click **"New +"** → **"PostgreSQL"**
3. Fill in:
   - **Name**: `smart-parking-db`
   - **Database**: `smart_parking`
   - **User**: `smart_parking_user`
   - **Plan**: Free
4. Click **"Create Database"**
5. **Copy the Internal Database URL** (you'll need it)

### Step 3: Deploy Backend on Render

#### Option A: Using Blueprint (Easiest)

1. Click **"New +"** → **"Blueprint"**
2. Connect your GitHub repository
3. Render will auto-detect `render.yaml`
4. Review services and click **"Apply"**
5. Wait for deployment (~5-10 minutes)

#### Option B: Manual Setup

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `smart-parking-backend`
   - **Root Directory**: Leave empty (root)
   - **Environment**: `Docker` (Render will auto-detect your Dockerfile)
   - **Build Command**: (Leave empty - Docker handles this)
   - **Start Command**: (Leave empty - Docker handles this)
   - **Plan**: Free
4. Add Environment Variables:
   ```
   SPRING_PROFILES_ACTIVE=production
   SPRING_DATASOURCE_URL=<Internal Database URL from Step 2>
   SPRING_DATASOURCE_USERNAME=<from database>
   SPRING_DATASOURCE_PASSWORD=<from database>
   JWT_SECRET=<generate random string, e.g., use openssl rand -hex 32>
   JWT_EXPIRATION=86400
   SPRING_JPA_HIBERNATE_DDL_AUTO=update
   CORS_ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend.vercel.
   ```
5. Click **"Create Web Service"**

### Step 4: Get Your Backend URL

After deployment completes:
1. Go to your web service dashboard
2. Copy the **Service URL** (e.g., `https://smart-parking-backend.onrender.com`)
3. Test it: Visit `https://your-backend-url.onrender.com/api/auth/health` (if you have a health endpoint)

### Step 5: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click **"Add New Project"**app
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
5. Add Environment Variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com
   ```
6. Click **"Deploy"**

### Step 6: Update CORS in Backend

1. Go back to Render dashboard → Your backend service
2. Go to **"Environment"** tab
3. Update `CORS_ALLOWED_ORIGINS`:
   ```
   CORS_ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app
   ```
4. Render will automatically redeploy

## ✅ Verification Checklist

- [ ] Database is running (green status in Render)
- [ ] Backend is running (green status in Render)
- [ ] Backend URL is accessible
- [ ] Frontend is deployed on Vercel
- [ ] Environment variables are set correctly
- [ ] Test registration: Create a new user
- [ ] Test login: Login with created user
- [ ] Test API: Fetch parking spots

## 🔧 Common Issues & Solutions

### Issue: Build fails with "PostgreSQL driver not found"
**Solution**: This should not happen as PostgreSQL is already configured. If it does, verify `pom.xml` has the PostgreSQL dependency and rebuild.

### Issue: Database connection error
**Solution**: 
- Check you're using the **Internal Database URL** (not external)
- Verify database credentials are correct
- Ensure database service is running

### Issue: CORS errors in browser
**Solution**: 
- Update `CORS_ALLOWED_ORIGINS` with your exact frontend URL
- Include protocol (https://)
- No trailing slashes

### Issue: Backend spins down after 15 minutes
**Solution**: This is normal for Render free tier. First request after spin-down takes ~30 seconds. Consider upgrading to paid plan for always-on service.

### Issue: "JWT_SECRET not set"
**Solution**: Generate a secret:
```bash
# On Mac/Linux
openssl rand -hex 32

# Or use online generator
# https://randomkeygen.com/
```

## 📝 Environment Variables Reference

### Backend (Render)

| Variable | Example Value | Required |
|----------|---------------|----------|
| `SPRING_PROFILES_ACTIVE` | `production` | Yes |
| `SPRING_DATASOURCE_URL` | `postgresql://...` | Yes (auto-set) |
| `SPRING_DATASOURCE_USERNAME` | `smart_parking_user` | Yes (auto-set) |
| `SPRING_DATASOURCE_PASSWORD` | `...` | Yes (auto-set) |
| `JWT_SECRET` | `your-secret-key-here` | Yes |
| `JWT_EXPIRATION` | `86400` | No (default: 86400) |
| `SPRING_JPA_HIBERNATE_DDL_AUTO` | `update` | No (default: update) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,https://...` | Yes |

### Frontend (Vercel)

| Variable | Example Value | Required |
|----------|---------------|----------|
| `NEXT_PUBLIC_API_URL` | `https://smart-parking-backend.onrender.com` | Yes |

## 🎯 Next Steps

1. **Test your deployment**: Try registering and logging in
2. **Monitor logs**: Check Render dashboard for any errors
3. **Set up custom domain** (optional): Add your own domain in Render/Vercel
4. **Enable HTTPS**: Automatically handled by Render/Vercel

## 💡 Pro Tips

1. **Use Internal Database URL**: Always use the internal URL for database connection (faster, more secure)
2. **Monitor Free Tier**: Render free tier has 750 hours/month limit
3. **Database Backups**: Free tier has 90-day retention
4. **Environment Variables**: Update CORS origins when deploying to production
5. **Logs**: Check Render logs if something isn't working

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Spring Boot on Render](https://render.com/docs/deploy-spring-boot)

---

**Need Help?** Check the full deployment guide in `DEPLOYMENT.md`

