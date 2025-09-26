# Photospots Backend

## Overview
The Photospots backend is designed to support a web application that helps photographers discover photogenic locations by leveraging geotagged photos from various sources. The backend is built using TypeScript and incorporates various services, including Supabase for database management, AWS for cloud functions, and Redis for caching.

## Project Structure
The project is organized into several directories, each serving a specific purpose:

- **src**: Contains the main application code.
  - **api**: Contains controllers, middlewares, and routes for handling API requests.
  - **config**: Configuration files for AWS, Redis, and Supabase.
  - **services**: Business logic for interacting with external APIs and processing data.
  - **utils**: Utility functions for clustering, geospatial calculations, and data validation.
  - **workers**: Background tasks for photo ingestion, clustering, and scoring.
  - **types**: TypeScript types/interfaces for various entities.
  - **db**: Database migrations, schema definitions, and seeding logic.
  - **app.ts**: Entry point of the application.

- **lambda**: Contains AWS Lambda functions for processing photos and handling API requests.

- **infra**: Infrastructure as code using Terraform for provisioning resources.

- **tests**: Contains unit and integration tests for the application.

## Setup Instructions
1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd photospots-backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Variables**
   Copy the `.env.example` to `.env` and fill in the required values.

4. **Database Setup**
   Run the database migrations to set up the initial schema:
   ```bash
   npx supabase db push
   ```

5. **Start the Application**
   ```bash
   npm run dev
   ```

## Features
- **User Authentication**: Secure login and registration using JWT tokens.
- **Hotspot Management**: Create, update, and retrieve hotspots based on geotagged photos.
- **Photo Handling**: Upload and manage photos with associated metadata.
- **Search Functionality**: Find hotspots based on various criteria, including keywords and geolocation.
- **Background Processing**: Use AWS Lambda functions for photo processing and clustering tasks.

## Technologies Used
- **TypeScript**: For type safety and better development experience.
- **Supabase**: For database management and authentication.
- **AWS**: For serverless functions and storage.
- **Redis**: For caching and improving performance.
- **PostgreSQL**: As the underlying database for Supabase.

## Testing
The project includes unit and integration tests to ensure the functionality of the API and services. To run the tests, use:
```bash
npm test
```

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.