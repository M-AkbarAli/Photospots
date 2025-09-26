#!/bin/bash

# This script sets up Redis for the Photospots backend project.

# Update package list and install Redis
echo "Updating package list..."
sudo apt-get update

echo "Installing Redis..."
sudo apt-get install -y redis-server

# Configure Redis to start on boot
echo "Configuring Redis to start on boot..."
sudo systemctl enable redis-server.service

# Start Redis service
echo "Starting Redis service..."
sudo systemctl start redis-server.service

# Check Redis status
echo "Checking Redis status..."
sudo systemctl status redis-server.service

echo "Redis setup completed successfully."