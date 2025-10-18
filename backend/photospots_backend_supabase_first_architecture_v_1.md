# Photospots Backend — Supabase‑first Architecture

> Goal: Ship a fast, low‑ops MVP using **Supabase (Postgres/PostGIS, Auth, Storage, Edge Functions)** with Redis for caching and a thin Node API where needed. Keep an easy path to add AWS (Lambda/S3/SQS) later.

---

## 1) High‑Level Overview

**Core choices**
- **Database**: Supabase **Postgres + PostGIS** for users, photos, hotspots, favorites, activity.
- **Auth**: Supabase Auth (Apple/Google/Email) + **RLS policies**.
- **Storage**: Supabase Storage buckets for originals & derivatives (served via Supabase CDN).
- **Compute**:
  - **Edge Functions** (Deno) for light jobs, webhooks, scheduled refresh.
  - Optional **Node API** (Fastify/Express) for custom endpoints, rate limiting, Redis integration.
- **Caching**: Redis for hot queries (nearby hotspots, popular lists) and rate limiting tokens.
- **Background**: Supabase **Cron** + Edge Functions for periodic enrichment (Flickr/OpenTripMap) & rescoring.

**Simple request path (read)**
Client → (optional) Node API cache → Redis hit → fallback to Postgres → return JSON (with CDN image URLs)

**Simple upload path (write)**
Client (authed) → Supabase Storage upload (signed by Supabase client) → insert DB row → Edge Function enqueues enrich/resize → write derivatives → update DB.

---

## 2) Component Diagram (ASCII)

```
[ Expo App ]
   |  HTTPS
   v
[ Supabase Auth ]  <-- JWT -->  [ Node API (optional) ]  <--->  [ Redis ]
       |                                   |                        ^
       |                                   v                        |
       v                            [ Supabase Postgres + PostGIS ] |
[ Supabase Storage CDN ]                   ^                        |
       ^                                   |                        |
       |                          [ Edge Functions + Cron ]  -------
       |                                     |
       |                                     v
       |                          Enrichment (Flickr, OpenTripMap)
```

---

## 3) Data Model (minimal)

### Tables
- **users** (managed by Supabase Auth; mirror essential fields in `public.users` if needed)
- **spots**
  - `id uuid PK`
  - `name text`
  - `geom geometry(Point, 4326)`
  - `lat double`, `lng double` (redundant for convenience)
  - `source text` (osm|ugc|opentrip|mix)
  - `categories text[]`
  - `score numeric` (computed)
  - `photo_url text` (representative thumbnail path)
  - `description text`
  - `last_enriched_at timestamptz`
- **spot_stats**
  - `spot_id uuid PK FK -> spots`
  - `photo_density numeric`
  - `recency_trend numeric`
  - `opentrip_popularity numeric`
- **photos**
  - `id uuid PK`
  - `user_id uuid FK -> auth.users`
  - `spot_id uuid NULL FK -> spots`
  - `original_key text` (storage path)
  - `variants jsonb` (e.g., `{ "w256":"…", "w1024":"…", "avif":"…" }`)
  - `width int`, `height int`, `sha256 text`
  - `visibility text` (public|private)
  - `created_at timestamptz`
- **favorites**
  - `user_id uuid`
  - `spot_id uuid`
  - `created_at timestamptz`
  - PK(`user_id`,`spot_id`)
- **user_submissions** (for UGC candidate spots)
  - `id uuid PK`, `user_id uuid`, `lat`, `lng`, `name`, `tip`, `status text` (pending|approved|rejected)

### Indexes
- `spots`: `gist (geom)`, `btree(score DESC)`, `btree(name text_pattern_ops)`
- `photos`: `btree(user_id)`, `btree(spot_id)`
- `favorites`: `btree(user_id)`, `btree(spot_id)`

### Example PostGIS helpers
```sql
-- nearest spots within radius meters
CREATE OR REPLACE FUNCTION api_spots_nearby(lat double precision, lng double precision, radius_m integer)
RETURNS SETOF spots AS $$
  SELECT s.*
  FROM spots s
  WHERE ST_DWithin(s.geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radius_m)
  ORDER BY s.score DESC, ST_Distance(s.geom, ST_SetSRID(ST_MakePoint(lng, lat), 4326)) ASC
  LIMIT 200;
$$ LANGUAGE sql STABLE;
```

---

## 4) Security (Auth + RLS + Storage)

- **Auth**: Supabase JWT on client; propagate to Edge Functions/Node API via `Authorization: Bearer`.
- **RLS** essentials:
  - `photos`: users can `INSERT` with their `user_id`, `SELECT` where `visibility='public' OR user_id=auth.uid()`, `DELETE/UPDATE` only if `user_id=auth.uid()`.
  - `favorites`: user can only access own rows.
  - `user_submissions`: user can read their own; admins can moderate.
- **Storage buckets**
  - `photos-public` (read: public; write: via auth client)
  - `photos-private` (no public read; access via signed URLs)
  - Keep **derivatives** in public; keep **original** in private if EXIF/privacy matters.

---

## 5) API Surface (minimal)

> Prefer Supabase RPC (SQL functions) for simple reads; use Node API where composition/caching/rate-limits are needed.

- `GET /v1/spots/nearby?lat&lng&radius` → list spots ordered by score, distance
- `GET /v1/spots/{id}` → details + representative photo + crowd tips
- `GET /v1/search?q&lat&lng` → text + geo bias (ILIKE + distance sort)
- `POST /v1/spots` → create UGC spot (authed)
- `POST /v1/photos` → initiate upload → returns storage path; client uploads via Supabase client
- `POST /v1/favorites/{spot_id}` / `DELETE /v1/favorites/{spot_id}`

**Edge Functions** (Deno)
- `on-photo-upload` (triggered after `photos` insert): generate variants (if doing server-side), update `variants`, extract EXIF safely (optional)
- `recompute-scores` (scheduled daily/weekly): refresh Flickr counts, recompute `score` into `spots`
- `moderate-submission` (admin‑only webhook)

---

## 6) Caching & Rate Limiting (Redis)

- **Keys**
  - Nearby cache: `nearby:{lat_bucket}:{lng_bucket}:{radius}` → JSON list (TTL 60–300s)
  - Spot detail: `spot:{id}` (TTL 5–10m)
  - Popular: `popular:{city_or_bbox}` (TTL 5–10m)
- **Rate limiting**
  - Token bucket per `user_id`/IP for write endpoints (photos, submissions): e.g., `rl:{user_id}:photos`.

---

## 7) Image Pipeline (lightweight)

- **Client upload** via Supabase client SDK to `photos-private/originals/{userId}/{photoId}`
- Edge Function or Node worker:
  1) Fetch original via signed URL
  2) Generate derivatives: `w256`, `w512`, `w1024`, `avif`
  3) Write to `photos-public/variants/{userId}/{photoId}/wXXX.ext`
  4) Update `photos.variants` JSON
  5) (Optional) extract GPS → suggest link to an existing spot or create candidate in `user_submissions`

> If derivatives are too heavy for Edge Functions, use a small Node worker (Docker) on a cheap VM, still reading/writing Supabase Storage.

---

## 8) Scoring (no‑ML heuristic)

`score = w_category + w_photo_density + w_recency + w_landmark_bonus - w_penalties`
- Pull **Flickr** counts and recency ratio into `spot_stats` weekly.
- Compute `score` in SQL; store in `spots.score`.
- Order by `score DESC, distance ASC`.

---

## 9) Directory Structure (example)

```
photospots-backend/
  src/
    api/            # Fastify routes (optional layer)
    services/       # geo, scoring, flickr, search
    workers/        # image variants, enrichment, cron handlers
    db/             # migrations, seed, RPC sql
    utils/          # validation, auth, error helpers
    app.ts          # server entry (if using Node API)
  edge-functions/
    on-photo-upload/
    recompute-scores/
  infra/
    supabase/       # config, cron schedules
    redis/          # docker-compose for local
  tests/
  .env.example
  package.json
  tsconfig.json
  README.md
```

---

## 10) Environment Variables

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `FLICKR_API_KEY`, `OPENTRIPMAP_API_KEY`
- `IMAGE_MAX_DIMENSIONS=1024`
- `APP_BASE_URL`, `CDN_BASE_URL` (e.g., `https://cdn.photospots.app`)

---

## 11) Observability

- Structured logs from Edge Functions / Node API
- Request IDs propagate to client
- Basic metrics: cache hit rate, p95 latency, upload errors, job failures
- Alerting on job failure spikes and storage errors

---

## 12) Deployment

- **Supabase**: managed project; apply migrations via `supabase db push`.
- **Edge Functions**: deploy with Supabase CLI; schedule via Supabase cron.
- **Node API (optional)**: Render/Fly/Heroku/Cloud Run (container). Connect to Supabase & Redis.
- **Redis**: Upstash or managed Redis (or Docker locally).

---

## 13) Cost Controls

- Stick to thumbnails ≤1024px; AVIF to cut bandwidth.
- Short CDN TTLs for hotspot lists; longer for images.
- Batch enrichment calls; set timeouts & retries.

---

## 14) Migration Path to AWS (when needed)

1) Store **paths/keys**, not absolute URLs, in DB now.
2) Put a **custom CDN domain** in front of Supabase Storage today.
3) Later: bulk-copy objects to **S3**; swap CDN origin to S3 (domain unchanged).
4) Move enrichment/variants to **Lambda** with S3 events; decommission the old worker.

---

## 15) Quick Start Checklist

- [ ] Create buckets: `photos-public`, `photos-private`
- [ ] Add tables & indexes; enable PostGIS
- [ ] Write RLS policies for `photos`, `favorites`, `user_submissions`
- [ ] Implement `GET /spots/nearby` RPC + Node cache
- [ ] Implement upload flow + `on-photo-upload` job
- [ ] Add weekly `recompute-scores` cron
- [ ] Ship!

