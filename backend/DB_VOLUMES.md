# Dual Database Volumes - Safe Seeding Workflow

This guide explains how to safely test database re-seeding without affecting your existing data.

## Overview

The backend now supports running **two Postgres databases in parallel**:

- **Fallback DB** (`postgres` service, port 5432): Your stable, production-ready seeded data
- **Fresh DB** (`postgres_fresh` service, port 5433): A clean database for safe testing and experimentation

Both databases use separate Docker volumes, so you can:
- ✅ Test new seeding strategies without risk
- ✅ Compare results between old and new seeds
- ✅ Roll back to fallback DB instantly if something goes wrong
- ✅ Keep your existing data safe at all times

## Prerequisites

Ensure Docker is running and you have the backend project ready.

---

## Step-by-Step Workflow

### 1. Create the Fresh Database Volume

First, create the new Docker volume for the fresh database:

```bash
cd backend
docker volume create backend-spring_pgdata_fresh
```

Verify both volumes exist:
```bash
docker volume ls | grep backend-spring_pgdata
```

You should see:
```
backend-spring_pgdata
backend-spring_pgdata_fresh
```

---

### 2. Start the Databases

You can run **both databases simultaneously** or just one at a time.

#### Option A: Run Both Databases (Recommended for Comparison)

```bash
# Start both Postgres services + Redis
docker compose up -d postgres postgres_fresh redis
```

Verify they're running:
```bash
docker ps | grep postgres
```

You should see:
- `photospots-postgres` on port 5432
- `photospots-postgres-fresh` on port 5433

#### Option B: Run Only Fallback DB

```bash
docker compose up -d postgres redis
```

#### Option C: Run Only Fresh DB

```bash
docker compose up -d postgres_fresh redis
```

---

### 3. Point Backend to the Desired Database

The backend uses the `SPRING_DATASOURCE_URL` environment variable to determine which database to connect to.

#### Connect to Fallback DB (Port 5432 - Default)

```bash
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/photospots"
```

Or run without setting it (uses default from `application.yml`).

#### Connect to Fresh DB (Port 5433)

```bash
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"
```

**Tip**: Add this to your shell profile or create helper scripts:
```bash
# ~/.bashrc or ~/.zshrc
alias use-fallback-db='export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/photospots"'
alias use-fresh-db='export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"'
```

---

### 4. Run Migrations

Migrations automatically run on application startup via Flyway. Just start the backend:

```bash
# With fallback DB
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/photospots"
./mvnw spring-boot:run

# Or with fresh DB
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"
./mvnw spring-boot:run
```

The migrations in `src/main/resources/db/migration/` will execute against whichever database is configured.

---

### 5. Seed the Fresh Database

**Important**: The fresh database starts empty, so you must seed it.

#### A. Seed Fresh DB with Reset (Clean Slate)

```bash
# Point to fresh DB
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"

# Run seeding with reset
./mvnw spring-boot:run -Dspring-boot.run.arguments="--seed --seed-reset"
```

✅ **Safety**: The `--seed-reset` flag is **allowed** on the fresh DB (port 5433) without additional flags.

#### B. Seed Fresh DB - Specific Locations

```bash
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"
./mvnw spring-boot:run -Dspring-boot.run.arguments="--seed"
```

#### C. Seed Fresh DB - Area Mode

```bash
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"
./mvnw spring-boot:run -Dspring-boot.run.arguments="--seed-area=downtown-toronto"
```

#### D. Enable Vision Filter

```bash
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"
./mvnw spring-boot:run -Dspring-boot.run.arguments="--seed --seed-reset --vision-filter=true"
```

---

### 6. 🚨 Safety Guard: Resetting the Fallback DB

The seed runner includes a **safety guard** to prevent accidental deletion of your fallback data.

If you try to reset the fallback DB (port 5432):

```bash
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/photospots"
./mvnw spring-boot:run -Dspring-boot.run.arguments="--seed --seed-reset"
```

You'll see:
```
╔══════════════════════════════════════════════════════════════════╗
║                    🚨 SAFETY GUARD TRIGGERED                      ║
╚══════════════════════════════════════════════════════════════════╝

   ❌ REFUSING to reset the FALLBACK database (port 5432)
   This appears to be your production/stable database with existing seed data.

   To reset anyway (⚠️  DANGER ZONE), add the flag:
      --i-know-what-im-doing
```

#### Override the Safety Guard (⚠️ Use with Caution)

If you **really** need to reset the fallback DB:

```bash
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/photospots"
./mvnw spring-boot:run -Dspring-boot.run.arguments="--seed --seed-reset --i-know-what-im-doing"
```

---

### 7. Verify Which Database You're Using

#### Check the Database at Startup

When the backend starts, the seed runner prints:
```
📊 Current datasource: jdbc:postgresql://localhost:5433/photospots
```

#### Query the API

Test an endpoint to see which data you're getting:

```bash
# Test fallback DB
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/photospots"
./mvnw spring-boot:run &
curl "http://localhost:8080/v1/spots/nearby?lat=43.65&lng=-79.38&radiusMeters=2000" | jq '.data | length'

# Test fresh DB
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"
./mvnw spring-boot:run &
curl "http://localhost:8080/v1/spots/nearby?lat=43.65&lng=-79.38&radiusMeters=2000" | jq '.data | length'
```

The results should differ if you've seeded them differently.

#### Direct Database Query

```bash
# Query fallback DB
psql postgresql://photospots:photospots@localhost:5432/photospots -c "SELECT COUNT(*) FROM spots;"

# Query fresh DB
psql postgresql://photospots:photospots@localhost:5433/photospots -c "SELECT COUNT(*) FROM spots;"
```

---

## Quick Reference

### Database Ports

| Service | Port | Volume | Use Case |
|---------|------|--------|----------|
| `postgres` | 5432 | `backend-spring_pgdata` | Fallback/Production data |
| `postgres_fresh` | 5433 | `backend-spring_pgdata_fresh` | Testing/Experimentation |

### Command Quick Reference

```bash
# Create fresh volume
docker volume create backend-spring_pgdata_fresh

# Start both databases
docker compose up -d postgres postgres_fresh redis

# Point to fresh DB
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"

# Seed fresh DB with reset
./mvnw spring-boot:run -Dspring-boot.run.arguments="--seed --seed-reset"

# Point back to fallback DB
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/photospots"
```

---

## Rollback / Switching Between Databases

To switch between databases, just change the environment variable:

```bash
# Use fallback DB
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/photospots"
./mvnw spring-boot:run

# Use fresh DB
export SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5433/photospots"
./mvnw spring-boot:run
```

No data is lost - both volumes persist independently.

---

## Cleanup

### Delete Fresh Database (Keep Fallback)

If you want to start over with the fresh DB:

```bash
# Stop the fresh DB container
docker compose down postgres_fresh

# Delete the fresh volume
docker volume rm backend-spring_pgdata_fresh

# Recreate it
docker volume create backend-spring_pgdata_fresh

# Start fresh DB again
docker compose up -d postgres_fresh
```

### Keep Both, Stop All Services

```bash
docker compose down
```

This stops containers but keeps both volumes intact.

---

## Troubleshooting

### "Cannot connect to database"

Ensure the database is running:
```bash
docker compose ps | grep postgres
```

### "Port already in use"

If port 5432 or 5433 is already taken:
```bash
lsof -i :5432
lsof -i :5433
```

Kill the process or change the port mapping in `docker-compose.yml`.

### "Volume not found"

Create the missing volume:
```bash
docker volume create backend-spring_pgdata_fresh
```

---

## Best Practices

1. **Always test seeding changes on the fresh DB first**
2. **Use the fallback DB for stable API development**
3. **Compare results between DBs before promoting fresh → fallback**
4. **Never run `--seed-reset` on fallback without the override flag**
5. **Document your seeding parameters for reproducibility**

---

## Advanced: Promoting Fresh DB to Fallback

If you're happy with the fresh DB and want to make it your new fallback:

```bash
# Backup current fallback (optional but recommended)
docker run --rm -v backend-spring_pgdata:/data -v $(pwd):/backup \
  ubuntu tar czf /backup/pgdata_backup_$(date +%Y%m%d_%H%M%S).tar.gz /data

# Stop services
docker compose down

# Rename volumes
docker volume rm backend-spring_pgdata_old || true
docker volume create backend-spring_pgdata_old
docker run --rm -v backend-spring_pgdata:/from -v backend-spring_pgdata_old:/to \
  alpine sh -c "cp -a /from/. /to/"

docker volume rm backend-spring_pgdata
docker volume create backend-spring_pgdata
docker run --rm -v backend-spring_pgdata_fresh:/from -v backend-spring_pgdata:/to \
  alpine sh -c "cp -a /from/. /to/"

# Start services
docker compose up -d postgres redis
```

---

## Summary

You now have a **safe, reversible workflow** for testing database seeding:

1. ✅ Fresh DB for experimentation (port 5433)
2. ✅ Fallback DB always available (port 5432)
3. ✅ Safety guards prevent accidental data loss
4. ✅ Switch between DBs instantly with environment variables
5. ✅ Compare results side-by-side

Happy seeding! 🌱
