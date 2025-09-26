-- SQL commands for initializing the database schema

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create hotspots table
CREATE TABLE hotspots (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create photos table
CREATE TABLE photos (
    id SERIAL PRIMARY KEY,
    hotspot_id INT REFERENCES hotspots(id) ON DELETE CASCADE,
    photo_url VARCHAR(255) NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    views INT DEFAULT 0,
    favourites INT DEFAULT 0
);

-- Create scores table
CREATE TABLE scores (
    id SERIAL PRIMARY KEY,
    hotspot_id INT REFERENCES hotspots(id) ON DELETE CASCADE,
    score FLOAT NOT NULL,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create a unique index on hotspots for latitude and longitude
CREATE UNIQUE INDEX idx_hotspot_location ON hotspots (latitude, longitude);