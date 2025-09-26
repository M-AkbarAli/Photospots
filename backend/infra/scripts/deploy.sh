#!/bin/bash

# This script deploys the Photospots backend application.

# Set environment variables
export $(grep -v '^#' .env | xargs)

# Build the application
echo "Building the application..."
npm install
npm run build

# Deploy to AWS
echo "Deploying to AWS..."
# Add your AWS deployment commands here, e.g., using AWS CLI or SAM

# Deploy to Supabase
echo "Deploying to Supabase..."
# Add your Supabase deployment commands here, e.g., using Supabase CLI

# Setup Redis
echo "Setting up Redis..."
bash setup-redis.sh

# Migrate the database
echo "Running database migrations..."
# Add your database migration commands here, e.g., using a migration tool

# Start the application
echo "Starting the application..."
npm start

echo "Deployment completed successfully!"