#!/bin/bash
# Helper scripts for switching between database environments

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Photospots Database Environment Switcher${NC}"
echo ""

# Function to check if a port is in use
check_port() {
    lsof -i :$1 &> /dev/null
    return $?
}

# Function to get container status
get_db_status() {
    local container=$1
    docker ps --filter "name=$container" --format "{{.Status}}" 2>/dev/null
}

# Show current environment
echo "Current Environment:"
if [ -n "$SPRING_DATASOURCE_URL" ]; then
    if [[ "$SPRING_DATASOURCE_URL" == *":5433/"* ]]; then
        echo -e "  ${GREEN}✓${NC} Fresh DB (port 5433)"
    elif [[ "$SPRING_DATASOURCE_URL" == *":5432/"* ]]; then
        echo -e "  ${GREEN}✓${NC} Fallback DB (port 5432)"
    else
        echo -e "  ${YELLOW}?${NC} Custom: $SPRING_DATASOURCE_URL"
    fi
else
    echo -e "  ${YELLOW}○${NC} Default (port 5432 from application.yml)"
fi

echo ""
echo "Database Status:"

# Check Fallback DB
fallback_status=$(get_db_status "photospots-postgres")
if [ -n "$fallback_status" ]; then
    echo -e "  ${GREEN}✓${NC} Fallback DB (port 5432): $fallback_status"
else
    echo -e "  ${RED}✗${NC} Fallback DB (port 5432): Not running"
fi

# Check Fresh DB
fresh_status=$(get_db_status "photospots-postgres-fresh")
if [ -n "$fresh_status" ]; then
    echo -e "  ${GREEN}✓${NC} Fresh DB (port 5433): $fresh_status"
else
    echo -e "  ${RED}✗${NC} Fresh DB (port 5433): Not running"
fi

# Check Redis
redis_status=$(get_db_status "photospots-redis")
if [ -n "$redis_status" ]; then
    echo -e "  ${GREEN}✓${NC} Redis: $redis_status"
else
    echo -e "  ${RED}✗${NC} Redis: Not running"
fi

echo ""
echo "Quick Commands:"
echo ""
echo "Switch to Fallback DB:"
echo "  ${GREEN}export SPRING_DATASOURCE_URL=\"jdbc:postgresql://localhost:5432/photospots\"${NC}"
echo ""
echo "Switch to Fresh DB:"
echo "  ${GREEN}export SPRING_DATASOURCE_URL=\"jdbc:postgresql://localhost:5433/photospots\"${NC}"
echo ""
echo "Start both databases:"
echo "  ${GREEN}docker compose up -d postgres postgres_fresh redis${NC}"
echo ""
echo "Stop all services:"
echo "  ${GREEN}docker compose down${NC}"
echo ""
