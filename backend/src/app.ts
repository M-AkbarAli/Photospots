import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import redis from 'redis';
import routes from './api/routes/index';
import { redisConfig } from './config/redis';
import { supabaseConfig } from './config/supabase';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Supabase
const supabase = createClient(supabaseConfig.url, supabaseConfig.key);

// Initialize Redis
const redisClient = redis.createClient(redisConfig);
redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

// Routes
app.use('/api', routes);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});