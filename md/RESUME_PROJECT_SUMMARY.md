# Photospots — Project Summary for Resume

## One-Liner
**Full-stack mobile application for discovering photogenic locations, featuring geospatial search, interactive maps, and cloud-native deployment on AWS.**

---

## Project Description

Photospots is a production-ready mobile app that helps photographers and travelers discover photogenic locations. Users can explore curated photo spots on an interactive map, browse photo galleries for each location, and navigate to exact photo coordinates. The app combines geospatial data processing, third-party API integration, and modern cloud infrastructure.

---

## Key Accomplishments / Resume Bullet Points

### Full-Stack Development
- Designed and built a **cross-platform mobile app** (iOS/Android) using **React Native**, **Expo SDK 54**, and **TypeScript**
- Developed a **RESTful API backend** with **Spring Boot 3.3** and **Java 21**, implementing JWT authentication and rate limiting
- Integrated **Mapbox** for interactive maps with custom clustering, markers, and gesture-based navigation

### Geospatial Engineering
- Implemented **PostGIS** spatial queries for radius-based location search using `ST_DWithin` and geographic indexing
- Built a **Flickr API data pipeline** that seeds the database with geotagged photos and photo metadata
- Optimized geospatial queries with **GIST indexes** achieving sub-100ms response times for location searches

### Cloud Infrastructure & DevOps
- Deployed containerized backend to **AWS ECS (Fargate)** with **Application Load Balancer** and health checks
- Configured **Amazon RDS (PostgreSQL)** with PostGIS extension and proper security group isolation
- Implemented **HTTPS/TLS** via **AWS ACM** with custom domain routing through **Route 53**
- Set up **AWS ElastiCache (Redis)** for caching frequently accessed location data (TTL-based invalidation)
- Managed secrets securely using **AWS Secrets Manager** integrated with ECS task definitions
- Built **multi-architecture Docker images** (ARM64) using Docker Buildx for cost-effective Graviton instances

### Performance & Caching
- Designed **Redis caching layer** with endpoint-specific TTLs (nearby: 5 min, search: 3 min, photos: 10 min)
- Implemented **IP-based rate limiting** filter to prevent API abuse (429 responses)

### Mobile Development
- Built file-based navigation using **Expo Router 6** with tab navigation and modal routes
- Implemented **bottom sheet UI** for spot details using `@gorhom/bottom-sheet` with gesture animations
- Integrated **device location services** for real-time user positioning and distance calculations

### Database Design
- Designed relational schema with **parent-child relationships** (landmarks ↔ photo hotspots)
- Used **JSONB columns** for flexible storage of photo variants and metadata
- Implemented **Flyway migrations** for version-controlled database schema evolution

### CI/CD & Release
- Configured **EAS Build** for generating iOS (TestFlight) and Android (Internal Track) builds
- Set up environment-specific configuration management for development and production

---

## Technology Stack

### Frontend
| Category | Technologies |
|----------|-------------|
| Framework | React Native 0.81, Expo SDK 54 |
| Language | TypeScript 5.9 |
| Navigation | Expo Router 6 (file-based) |
| Maps | Mapbox (@rnmapbox/maps) |
| UI Components | @gorhom/bottom-sheet, react-native-reanimated |
| Location | expo-location |
| Storage | AsyncStorage |

### Backend
| Category | Technologies |
|----------|-------------|
| Framework | Spring Boot 3.3.2 |
| Language | Java 21 |
| Database | PostgreSQL 14 + PostGIS |
| Cache | Redis |
| Auth | JWT (JJWT library) |
| ORM | Spring Data JPA + Hibernate Spatial |
| Migrations | Flyway |
| Build | Maven |

### Cloud Infrastructure (AWS)
| Category | Services |
|----------|----------|
| Compute | ECS Fargate (ARM64/Graviton) |
| Load Balancing | Application Load Balancer (ALB) |
| Database | RDS PostgreSQL with PostGIS |
| Caching | ElastiCache Redis |
| DNS | Route 53 |
| SSL/TLS | AWS Certificate Manager (ACM) |
| Secrets | AWS Secrets Manager |
| Monitoring | CloudWatch Logs, Alarms |
| Container Registry | ECR |

### DevOps
| Category | Tools |
|----------|-------|
| Containerization | Docker, Docker Compose |
| Build | Docker Buildx (multi-arch) |
| Mobile CI/CD | EAS Build (Expo Application Services) |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/spots/nearby` | Find photo spots within radius (geospatial) |
| GET | `/v1/spots/search` | Text search with optional geo-sorting |
| GET | `/v1/spots/{id}` | Get spot details |
| GET | `/v1/spots/{id}/hotspots` | Get nearby photo hotspots for a landmark |
| GET | `/v1/spots/{id}/photos` | Get photos for a spot |
| POST | `/v1/spots` | Create new spot (authenticated) |
| GET | `/v1/auth/me` | Get current user (authenticated) |

---

## Architecture Highlights

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Mobile App (iOS/Android)                     │
│                    React Native + Expo + Mapbox                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS Application Load Balancer                     │
│                    (HTTPS + ACM Certificate)                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS ECS Fargate (ARM64)                           │
│              Spring Boot Backend (Containerized)                     │
│         ┌─────────────────────────────────────────┐                 │
│         │  - JWT Auth Filter                       │                 │
│         │  - Rate Limiting (IP-based)             │                 │
│         │  - Redis Cache Service                  │                 │
│         │  - PostGIS Spatial Queries              │                 │
│         └─────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
                          │                    │
                          ▼                    ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│     Amazon RDS PostgreSQL    │   │    Amazon ElastiCache        │
│        + PostGIS             │   │         Redis                │
└──────────────────────────────┘   └──────────────────────────────┘
```

---

## Keywords for ATS (Applicant Tracking Systems)

**Languages:** Java, TypeScript, SQL  
**Frameworks:** Spring Boot, React Native, Expo  
**Databases:** PostgreSQL, PostGIS, Redis  
**AWS:** ECS, Fargate, RDS, ElastiCache, ALB, Route 53, ACM, Secrets Manager, CloudWatch, ECR  
**Tools:** Docker, Maven, Git, Flyway  
**Concepts:** RESTful APIs, JWT Authentication, Geospatial Queries, Caching, Containerization, CI/CD, Mobile Development, Cloud Infrastructure

---

## Sample Resume Bullets (Copy-Paste Ready)

**Option 1 - Full-Stack Focus:**
> Built a full-stack mobile app (React Native/Expo + Spring Boot/Java) for discovering photo locations, featuring Mapbox integration, PostGIS geospatial queries, and Redis caching deployed on AWS ECS Fargate

**Option 2 - Cloud/DevOps Focus:**
> Deployed containerized Spring Boot backend to AWS ECS Fargate with ALB, RDS PostgreSQL (PostGIS), ElastiCache Redis, and HTTPS via ACM/Route 53, achieving sub-100ms API response times

**Option 3 - Mobile Focus:**
> Developed cross-platform mobile app (iOS/Android) using React Native and Expo SDK 54 with Mapbox maps, real-time geolocation, and file-based navigation, deployed via EAS Build to TestFlight and Google Play

**Option 4 - Backend Focus:**
> Designed RESTful API with Spring Boot 3.3 (Java 21) implementing JWT authentication, IP-based rate limiting, PostGIS spatial queries, and Redis caching with TTL-based invalidation

**Option 5 - Concise:**
> Photospots: Full-stack photo spot discovery app — React Native frontend, Spring Boot/PostgreSQL/Redis backend, deployed on AWS (ECS, RDS, ElastiCache, ALB)
