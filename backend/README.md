# Photospots Backend

> Supabase-first backend for discovering photogenic locations. Built with Postgres/PostGIS, Redis caching, and Supabase Edge Functions.

## 📋 Architecture

See [`photospots_backend_supabase_first_architecture_v_1.md`](./photospots_backend_supabase_first_architecture_v_1.md) for the complete architecture blueprint.

**Tech Stack:**
- **Database**: Supabase Postgres + PostGIS
- **Auth**: Supabase Auth (with RLS policies)
- **Storage**: Supabase Storage (images & derivatives)
- **Caching**: Redis
- **API**: Express + TypeScript
- **Edge Compute**: Supabase Edge Functions (Deno)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Redis (local or cloud)
- Supabase account ([supabase.com](https://supabase.com))
- Supabase CLI: `npm install -g supabase`

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env and add your credentials:
# - SUPABASE_URL (from Supabase project settings)
# - SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - REDIS_URL (local: redis://localhost:6379 or cloud URL)
```

### 3. Set Up Supabase

#### Option A: Use Supabase CLI (Recommended)

```bash
# Initialize Supabase in your project
supabase init

# Link to your Supabase project
supabase link --project-ref your-project-ref

# Push the database migration
supabase db push

# Or run migration manually
supabase db reset
```

#### Option B: Manual Setup

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `src/db/migrations/001_init.sql`
4. Execute the SQL

### 4. Set Up Redis (Local)

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or install locally (macOS)
brew install redis
brew services start redis
```

### 5. Run the Development Server

```bash
# Development mode with auto-reload
npm run dev

# The server will start at http://localhost:3000
# Health check: http://localhost:3000/health
```

## 📡 API Endpoints

### Spots

```bash
# Get nearby spots
GET /v1/spots/nearby?lat=37.7749&lng=-122.4194&radius=5000

# Search spots (with optional geo bias)
GET /v1/spots/search?q=golden+gate&lat=37.7749&lng=-122.4194

# Get spot by ID
GET /v1/spots/:id

# Create new spot (UGC)
POST /v1/spots
{
  "name": "Beautiful Overlook",
  "lat": 37.7749,
  "lng": -122.4194,
  "categories": ["landscape", "sunset"],
  "description": "Amazing views at sunset"
}
```

### Photos (Coming Soon)

```bash
# List photos
GET /v1/photos

# Upload photo
POST /v1/photos
```

### Favorites (Coming Soon - Requires Auth)

```bash
# Get user favorites
GET /v1/favorites

# Add favorite
POST /v1/favorites/:spotId

# Remove favorite
DELETE /v1/favorites/:spotId
```

## 🗄️ Database Schema

### Main Tables

- **spots** - Photo locations with PostGIS geometry
- **spot_stats** - Aggregated statistics per spot
- **photos** - User-uploaded photos with variants
- **favorites** - User favorites (many-to-many)
- **user_submissions** - UGC spot submissions for moderation

### Key Features

- PostGIS spatial indexing for fast geo queries
- Row Level Security (RLS) on photos, favorites, submissions
- SQL RPC functions: `api_spots_nearby`, `api_spots_search`
- Automatic geometry generation from lat/lng

## 🔧 Edge Functions

Deploy serverless functions to Supabase for background tasks:

### on-photo-upload

Triggered when a photo is uploaded. Generates image variants (thumbnails, etc.).

```bash
# Deploy to Supabase
supabase functions deploy on-photo-upload

# Test locally
supabase functions serve on-photo-upload
```

### recompute-scores

Scheduled job (daily/weekly) to refresh spot scores based on photo density, recency, and external APIs.

```bash
# Deploy
supabase functions deploy recompute-scores

# Schedule via Supabase Cron (in dashboard):
# 0 2 * * * (daily at 2 AM)
```

## 📦 Project Structure

```
backend/
├── src/
│   ├── api/
│   │   └── routes/          # Express route handlers
│   ├── config/              # Supabase, Redis configs
│   ├── db/
│   │   └── migrations/      # SQL migration files
│   ├── services/            # Business logic (spots, photos, scoring)
│   ├── types/               # TypeScript interfaces
│   ├── utils/               # Helpers (cache, geospatial)
│   └── app.ts              # Express app entry point
├── edge-functions/
│   ├── on-photo-upload/     # Photo processing (Deno)
│   └── recompute-scores/    # Score calculation (Deno)
├── .env.example             # Environment template
├── package.json
├── tsconfig.json
└── photospots_backend_supabase_first_architecture_v_1.md
```

## 🧪 Testing

```bash
# Run tests (TODO: add tests)
npm test

# Run in watch mode
npm run test:watch
```

## 🔐 Security Checklist

- [ ] Set up Supabase Auth (Apple/Google/Email)
- [ ] Enable RLS policies (already in migration)
- [ ] Create storage buckets: `photos-public`, `photos-private`
- [ ] Configure bucket policies (public read for derivatives)
- [ ] Add rate limiting middleware (express-rate-limit)
- [ ] Add auth middleware to protected routes
- [ ] Never commit `.env` files (already in `.gitignore`)

## 📝 Supabase Storage Setup

1. Go to Storage in Supabase dashboard
2. Create buckets:
   - `photos-public` (public read, authenticated write)
   - `photos-private` (no public access)
3. Configure policies for authenticated uploads

## 🚢 Deployment

### Deploy Node API

**Option 1: Render / Fly.io / Railway**

```bash
# Build
npm run build

# Start production
npm start
```

**Option 2: Docker**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
CMD ["node", "dist/app.js"]
```

### Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy

# Set environment secrets
supabase secrets set FLICKR_API_KEY=your_key
supabase secrets set OPENTRIPMAP_API_KEY=your_key
```

## 🔄 Next Steps

### Immediate (Core MVP)

- [ ] Install dependencies: `npm install`
- [ ] Set up `.env` with Supabase credentials
- [ ] Run Supabase migration
- [ ] Start Redis locally
- [ ] Test `/v1/spots/nearby` endpoint
- [ ] Deploy Edge Functions

### Short-term (Auth & Photos)

- [ ] Add Supabase Auth middleware
- [ ] Implement photo upload to Supabase Storage
- [ ] Connect `on-photo-upload` Edge Function
- [ ] Add favorites endpoints
- [ ] Implement user submissions moderation

### Medium-term (Enrichment)

- [ ] Integrate Flickr API for photo counts
- [ ] Integrate OpenTripMap for POI data
- [ ] Implement scoring algorithm refinement
- [ ] Add scheduled enrichment jobs

### Long-term (Scale & Polish)

- [ ] Add comprehensive test suite
- [ ] Set up CI/CD pipeline
- [ ] Add monitoring & logging (Sentry, Datadog)
- [ ] Optimize caching strategies
- [ ] Add GraphQL layer (optional)
- [ ] Migration path to AWS (S3, Lambda) if needed

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostGIS Reference](https://postgis.net/documentation/)
- [Redis Documentation](https://redis.io/docs/)
- [Express Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)

## 🐛 Troubleshooting

### "Cannot find module" errors
Run `npm install` to install dependencies.

### Redis connection errors
Ensure Redis is running: `redis-cli ping` should return `PONG`.

### Supabase auth errors
Check your `SUPABASE_URL` and keys in `.env`.

### PostGIS functions not found
Ensure you've run the migration: `supabase db push`.

## 📄 License

MIT

---

Built with ❤️ for photographers and location enthusiasts
