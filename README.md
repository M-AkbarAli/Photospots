# Photospots

A mobile-first application that helps users discover photogenic locations and landmarks. Explore curated photography spots on an interactive map, view photos from each location, and navigate to exact photo spots.

## 🚀 Features

- **Interactive Map**: Discover nearby photogenic spots with geolocation-based search
- **Photo Galleries**: Browse curated photos from each location
- **Navigation**: Get directions to exact photo spots
- **Search**: Find spots by name or location
- **Landmark Discovery**: Explore major landmarks and their nearby photo hotspots

## 🏗️ Architecture

### Backend
- **Framework**: Spring Boot 3.3.2 (Java 21)
- **Database**: PostgreSQL 14 with PostGIS for geospatial queries
- **Cache**: Redis for performance optimization
- **External APIs**: Flickr API for photo data seeding
- **Authentication**: JWT-based (stateless)

### Frontend
- **Framework**: React Native with Expo SDK 54
- **Navigation**: Expo Router 6 (file-based routing)
- **Maps**: Mapbox via @rnmapbox/maps
- **Location Services**: expo-location
- **Language**: TypeScript 5.9

## 📋 Prerequisites

- **Backend**:
  - Java 21+
  - Maven 3.8+
  - Docker & Docker Compose (for PostgreSQL and Redis)
  
- **Frontend**:
  - Node.js 18+
  - npm or yarn
  - Expo CLI
  - iOS: Xcode 15+ (for iOS development)
  - Android: Android Studio (for Android development)

## 🛠️ Setup

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Create environment file**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your configuration (see `backend/.env.example` for details).

3. **Start PostgreSQL and Redis**:
   ```bash
   docker-compose up -d postgres redis
   ```

4. **Run the application**:
   ```bash
   ./mvnw spring-boot:run
   # OR
   mvn spring-boot:run
   ```

   The API will be available at `http://localhost:8080`

5. **Seed the database** (optional):
   ```bash
   mvn spring-boot:run -Dspring-boot.run.arguments="--seed"
   ```

For more details, see [backend/README.md](./backend/README.md).

### Frontend Setup

1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create environment file**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Mapbox tokens (see `frontend/.env.example` for details).

4. **Generate native code** (required for Mapbox):
   ```bash
   npx expo prebuild
   ```

5. **Run the app**:
   ```bash
   # iOS
   npx expo run:ios
   
   # Android
   npx expo run:android
   
   # Development server
   npx expo start
   ```

**Important**: This app requires development builds and cannot run in Expo Go due to native Mapbox dependencies.

## 🔑 Environment Variables

### Backend (`.env` in `backend/`)

See `backend/.env.example` for the complete list. Key variables:
- `FLICKR_API_KEY` - Flickr API key for photo seeding
- `FLICKR_API_SECRET` - Flickr API secret
- `JWT_SECRET` - Secret key for JWT token signing
- Database and Redis connection settings

### Frontend (`.env` in `frontend/`)

See `frontend/.env.example` for the complete list. Key variables:
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` - Mapbox public access token (starts with `pk.`)
- `MAPBOX_DOWNLOAD_TOKEN` - Mapbox download token (starts with `sk.`)
- `EXPO_PUBLIC_API_BASE_URL` - Backend API URL (default: `http://localhost:8080`)

## 📚 Documentation

- [Backend README](./backend/README.md) - Backend setup and API documentation
- [Frontend Architecture](./FRONTEND_ARCHITECTURE.md) - Frontend technical details
- [Project Technical Summary](./PROJECT_TECHNICAL_SUMMARY.md) - Complete technical overview
- [Mapbox Setup Guide](./frontend/MAPBOX_SETUP.md) - Mapbox configuration guide

## 🗺️ API Endpoints

### Public Endpoints

- `GET /v1/spots/nearby` - Get nearby spots by coordinates
- `GET /v1/spots/search` - Search spots by query
- `GET /v1/spots/{id}` - Get spot details
- `GET /v1/spots/{landmarkId}/hotspots` - Get hotspots near a landmark
- `GET /v1/spots/{spotId}/photos` - Get photos for a spot

### Protected Endpoints (JWT Required)

- `POST /v1/spots` - Create a new spot
- `GET /v1/auth/me` - Get current user info

See [backend/README.md](./backend/README.md) for detailed API documentation.

## 🧪 Development

### Backend Development

```bash
cd backend
# Start services
docker-compose up -d

# Run with hot reload (if using Spring Boot DevTools)
mvn spring-boot:run

# Run tests
mvn test
```

### Frontend Development

```bash
cd frontend
# Start Metro bundler
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🙏 Acknowledgments

- [Flickr](https://www.flickr.com/) for photo data
- [Mapbox](https://www.mapbox.com/) for mapping services
- [Expo](https://expo.dev/) for the development platform

## 📧 Contact

For questions or support, please open an issue on GitHub.

