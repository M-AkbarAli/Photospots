Steps
Document current APIs/data from src and lock target Spring Boot modules (api, auth, geo, storage, cache).
Define Postgres+PostGIS schema and Flyway migrations, re-creating Supabase RPCs/functions (nearby/search) now run in your DB.
Choose auth approach (lightweight JWT + optional refresh), map current middleware behavior from backend/api/middlewares/auth.ts into Spring Security filters.
Rebuild core endpoints (nearby, search, spot detail/create) with Redis caching mirroring keys in backend/utils/cache.ts and geospatial helpers akin to backend/utils/geospatial.ts.
Stand up S3 storage + image pipeline (upload, variants, secure URLs), replacing planned Supabase Storage flow; wire to photos endpoints and metadata tables.
Update Expo client base URL/auth flow to hit the new API; align route expectations noted in app and planned map calls to nearby/search/detail.
Further Considerations
Auth choice: JWT + refresh vs short-lived JWT only—pick one and define expiry/rotation.
Image processing: handle in Spring async jobs vs AWS Lambda + SQS; decide based on ops comfort/cost.
Deployment: target ECS/Fargate vs EC2 vs Elastic Beanstalk; consider CI/CD, secrets, VPC, and Redis/S3 connectivity.
Observability: add metrics/log tracing (e.g., OpenTelemetry + CloudWatch) and rate limiting at API gateway or app layer.
Data migration: plan export from Supabase to your Postgres (schema + data), including PostGIS extensions and any functions.
Current-State Notes (for reference)
API surface: nearby/search/spot detail/create; favorites/photos routes exist but stubbed; auth helper endpoints me/logout; health check.
Data: spots with geom (lng/lat), score, categories, photo_url; spot_stats (density/recency/opentrip/flickr); photos table planned with storage keys/variants; favorites and user_submissions planned.
Auth: Supabase JWT verification with optional attach-user; POST spots requires auth; favorites guarded but not implemented.
Caching: Redis keys for nearby/search/spot detail/hotspots/photos with TTLs ~3–10 minutes; invalidation patterns documented.
Geospatial: uses PostGIS functions/RPCs for nearby/search; helper math (haversine/bbox) in utils.
Storage: Supabase Storage was planned (public/private buckets) with edge function on-photo-upload for variants; not wired yet.
Edge functions: recompute-scores scheduled; on-photo-upload for image variants (planned).
Seeds: Flickr-based seed script with quality filters.
