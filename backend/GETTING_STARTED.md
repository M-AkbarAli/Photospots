# 🎯 Getting Started - Your First 30 Minutes

This guide will get your Photospots backend running locally in ~30 minutes.

## ✅ Step-by-Step Setup

### 1. Install Node Dependencies (2 min)

```bash
cd backend
npm install
```

This installs Express, Supabase client, Redis, TypeScript, and dev tools.

### 2. Set Up Supabase (10 min)

#### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Choose a name (e.g., "photospots")
4. Set a strong database password
5. Choose a region close to you
6. Wait ~2 minutes for project to provision

#### Get Your Credentials

1. In your Supabase project, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://abcxyz.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)
   - **service_role key** (starts with `eyJ...`, keep this secret!)

#### Run the Database Migration

**Option A: Via Supabase Dashboard (Easiest)**

1. In Supabase, go to **SQL Editor**
2. Click **New Query**
3. Open `backend/src/db/migrations/001_init.sql` in your editor
4. Copy the entire contents
5. Paste into Supabase SQL Editor
6. Click **Run** (bottom right)
7. You should see "Success. No rows returned"

**Option B: Via Supabase CLI**

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link your project (get ref from project URL)
supabase link --project-ref your-project-ref

# Push migration
supabase db push
```

### 3. Set Up Redis (5 min)

#### Option A: Docker (Recommended)

```bash
docker run -d -p 6379:6379 --name photospots-redis redis:7-alpine
```

#### Option B: Local Installation

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

### 4. Configure Environment Variables (3 min)

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
NODE_ENV=development
PORT=3000

# FROM SUPABASE DASHBOARD
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your-service-role-key

# REDIS (if running locally)
REDIS_URL=redis://localhost:6379

# OPTIONAL (for later)
FLICKR_API_KEY=
OPENTRIPMAP_API_KEY=
```

Save the file.

### 5. Start the Development Server (1 min)

```bash
npm run dev
```

You should see:
```
✓ Redis connected
✓ Server running on http://localhost:3000
  Environment: development
  Health check: http://localhost:3000/health
```

### 6. Test the API (2 min)

Open a new terminal and test:

```bash
# Health check
curl http://localhost:3000/health

# Should return:
# {"status":"ok","timestamp":"2025-...","env":"development"}
```

## 🎉 You're Running!

Your backend is now live. The API is ready but **the database is empty**.

## 📝 Next: Add Some Test Data

### Option 1: Via Supabase Dashboard

1. Go to **Table Editor** in Supabase
2. Select the `spots` table
3. Click **Insert** → **Insert row**
4. Fill in:
   - `name`: "Golden Gate Bridge"
   - `lat`: 37.8199
   - `lng`: -122.4783
   - `source`: osm
   - `score`: 95
   - `description`: "Iconic SF landmark"
5. Click **Save**

The `geom` column will auto-populate from lat/lng.

### Option 2: Via API

```bash
curl -X POST http://localhost:3000/v1/spots \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Golden Gate Bridge",
    "lat": 37.8199,
    "lng": -122.4783,
    "categories": ["landmark", "bridge"],
    "description": "Iconic San Francisco landmark"
  }'
```

### Test Nearby Search

```bash
# Find spots near San Francisco
curl "http://localhost:3000/v1/spots/nearby?lat=37.7749&lng=-122.4194&radius=10000"

# Should return your test spot with distance
```

## 🔍 Verify Everything Works

Run these checks:

✅ **Database**: Go to Supabase → Table Editor → see `spots`, `photos`, `favorites` tables  
✅ **Redis**: `redis-cli ping` returns `PONG`  
✅ **API**: `curl http://localhost:3000/health` returns `{"status":"ok"}`  
✅ **PostGIS**: Create a spot via API, check it appears in nearby search

## 🚀 What You Have Now

- ✅ Express API running on port 3000
- ✅ Supabase Postgres + PostGIS database
- ✅ Redis caching layer
- ✅ Working endpoints:
  - `GET /v1/spots/nearby` - Find spots near a location
  - `GET /v1/spots/search` - Search spots by name
  - `GET /v1/spots/:id` - Get spot details
  - `POST /v1/spots` - Create new spots

## 📋 What's Not Done Yet

- ❌ **Auth**: No authentication middleware (routes are public)
- ❌ **Photos**: Upload endpoint not implemented
- ❌ **Storage**: Supabase Storage buckets not created
- ❌ **Edge Functions**: Not deployed
- ❌ **Favorites**: Endpoints exist but need auth

## 🎯 Recommended Next Steps (Pick One)

### Path A: Add Authentication (30 min)
1. Enable Supabase Auth providers (Email, Google, Apple)
2. Add auth middleware to protected routes
3. Test with Supabase client in frontend

### Path B: Set Up Image Storage (20 min)
1. Create Supabase Storage buckets
2. Implement photo upload endpoint
3. Deploy `on-photo-upload` Edge Function

### Path C: Add Real Data (15 min)
1. Get Flickr API key (free)
2. Write a seed script to import photos from Flickr
3. Test enrichment and scoring

### Path D: Connect to Frontend (10 min)
1. Start your Expo frontend
2. Configure Supabase client with same credentials
3. Test API calls from mobile app

## 🆘 Troubleshooting

### "Cannot find module" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### Redis connection refused
```bash
# Check Redis is running
redis-cli ping

# Start Redis
docker start photospots-redis
# OR
brew services start redis
```

### Supabase errors
- Check `.env` has correct `SUPABASE_URL` and keys
- Verify migration ran successfully in SQL Editor
- Check Supabase project is not paused

### Port 3000 already in use
```bash
# Change PORT in .env
PORT=3001
```

## 📚 Learn More

- **Architecture**: Read `photospots_backend_supabase_first_architecture_v_1.md`
- **Full README**: See `README.md` for deployment & advanced topics
- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)

---

**You're all set!** 🎊 Your backend is running and ready for development.

Need help? Check the full README or architecture document.
