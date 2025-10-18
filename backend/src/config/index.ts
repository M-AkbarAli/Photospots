import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  externalApis: {
    flickr: {
      apiKey: process.env.FLICKR_API_KEY || '',
      apiSecret: process.env.FLICKR_API_SECRET || '',
    },
    openTripMap: {
      apiKey: process.env.OPENTRIPMAP_API_KEY || '',
    },
  },
  
  images: {
    maxDimensions: parseInt(process.env.IMAGE_MAX_DIMENSIONS || '1024', 10),
    cdnBaseUrl: process.env.CDN_BASE_URL || '',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
