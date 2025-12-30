# Photospots Spring Boot Backend

Baseline Spring Boot skeleton to replace the legacy TypeScript/Supabase backend. Targets Postgres + PostGIS, Redis caching, JWT auth, and S3 image storage.

## Stack
- Spring Boot 3.3 (Java 21)
- Postgres + PostGIS (hibernate-spatial)
- Redis (Spring Data Redis)
- AWS S3 (AWS SDK v2)
- JWT (jjwt)

## Modules (planned)
- api: REST controllers (`/v1/spots`, `/v1/auth`, `/v1/photos`, `/v1/favorites`)
- service: business logic + cache invalidation
- repository: JPA + native PostGIS queries
- config: security, redis, s3, db
- domain/dto: entities and transport objects

## Running (dev)
1. Set env vars or edit `src/main/resources/application.yml` for Postgres, Redis, AWS, JWT secret.
2. Start Postgres with PostGIS and Redis locally.
3. `mvn spring-boot:run` from this directory.

## Database Seeding

The backend supports dual Postgres volumes for safe testing:
- **Fallback DB** (port 5432): Stable production data
- **Fresh DB** (port 5433): Safe testing environment

See **[DB_VOLUMES.md](./DB_VOLUMES.md)** for the complete workflow including:
- Setting up dual databases
- Switching between databases
- Safety guards to prevent accidental data loss
- Seeding commands and best practices

Quick start for fresh database testing:
```bash
# Create fresh volume
docker volume create backend-spring_pgdata_fresh

# Start both databases
docker compose up -d postgres postgres_fresh redis

# Point to fresh DB and seed
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"
./mvnw spring-boot:run -Dspring-boot.run.arguments="--seed --seed-reset"
```

## Next steps
- Implement JWT issuance/validation and wire SecurityFilterChain with a JWT filter.
- Add geometry helpers to build `Point` from lat/lng and port legacy nearby/search RPCs as PostGIS queries.
- Mirror Redis cache keys/TTLs from the TypeScript backend for nearby/search/hotspots/photos.
- Add S3 upload endpoints and variant processing (Lambda or async jobs).
- Add Flyway migrations and schema for spots/photos/favorites/user_submissions.
