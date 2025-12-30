#!/bin/bash
# Quick setup script for fresh database environment

set -e  # Exit on error

echo "🚀 Setting up Fresh Database Environment"
echo ""

# Step 1: Create volume if it doesn't exist
echo "1️⃣  Creating fresh database volume..."
if docker volume inspect backend-spring_pgdata_fresh &> /dev/null; then
    echo "   ✓ Volume backend-spring_pgdata_fresh already exists"
else
    docker volume create backend-spring_pgdata_fresh
    echo "   ✓ Created volume backend-spring_pgdata_fresh"
fi

echo ""

# Step 2: Start services
echo "2️⃣  Starting database services..."
docker compose up -d postgres postgres_fresh redis
echo "   ✓ Services started"

echo ""

# Step 3: Wait for databases to be healthy
echo "3️⃣  Waiting for databases to be ready..."
timeout=30
elapsed=0

while [ $elapsed -lt $timeout ]; do
    if docker exec photospots-postgres-fresh pg_isready -U photospots &> /dev/null; then
        echo "   ✓ Fresh database is ready!"
        break
    fi
    echo "   ⏳ Waiting for fresh database... ($elapsed/$timeout seconds)"
    sleep 2
    elapsed=$((elapsed + 2))
done

if [ $elapsed -ge $timeout ]; then
    echo "   ⚠️  Timeout waiting for database. Check with: docker compose logs postgres_fresh"
    exit 1
fi

echo ""

# Step 4: Show next steps
echo "✅ Setup complete!"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Point your backend to the fresh database:"
echo "   ${GREEN}export SPRING_DATASOURCE_URL=\"jdbc:postgresql://localhost:5433/photospots\"${NC}"
echo ""
echo "2. Run the backend with migrations:"
echo "   ./mvnw spring-boot:run"
echo ""
echo "3. Seed the fresh database:"
echo "   ./mvnw spring-boot:run -Dspring-boot.run.arguments=\"--seed --seed-reset\""
echo ""
echo "4. Check database status anytime:"
echo "   ./db-status.sh"
echo ""
echo "📚 Full documentation: ./DB_VOLUMES.md"
echo ""
