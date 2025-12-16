.PHONY: dev build run stop clean

# Start backend with hot reload (auto-restarts on file changes)
# Stop with Ctrl+C
dev:
	@./run-dev.sh

# Build the application into a JAR
build:
	mvn clean package -DskipTests

# Run the pre-built JAR
run:
	java -jar target/photospots-backend-0.0.1-SNAPSHOT.jar

# Stop Docker containers (Postgres + Redis)
stop:
	docker-compose down

# Alias for stop
clean: stop