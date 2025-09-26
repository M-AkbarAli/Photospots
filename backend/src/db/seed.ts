import { createClient } from '@supabase/supabase-js';
import { Hotspot } from '../types/hotspot';
import { Photo } from '../types/photo';
import { User } from '../types/user';
import { supabase } from '../config/supabase';

const seedHotspots: Hotspot[] = [
    {
        id: 1,
        name: 'Golden Gate Bridge',
        description: 'Iconic bridge in San Francisco.',
        latitude: 37.8199,
        longitude: -122.4783,
        category: 'landscape',
        created_at: new Date(),
    },
    {
        id: 2,
        name: 'Eiffel Tower',
        description: 'Famous landmark in Paris.',
        latitude: 48.8584,
        longitude: 2.2945,
        category: 'landscape',
        created_at: new Date(),
    },
];

const seedPhotos: Photo[] = [
    {
        id: 1,
        title: 'Golden Gate Sunset',
        description: 'A beautiful sunset over the Golden Gate Bridge.',
        latitude: 37.8199,
        longitude: -122.4783,
        url: 'https://example.com/golden-gate-sunset.jpg',
        hotspot_id: 1,
        created_at: new Date(),
    },
    {
        id: 2,
        title: 'Eiffel Tower at Night',
        description: 'The Eiffel Tower illuminated at night.',
        latitude: 48.8584,
        longitude: 2.2945,
        url: 'https://example.com/eiffel-tower-night.jpg',
        hotspot_id: 2,
        created_at: new Date(),
    },
];

const seedUsers: User[] = [
    {
        id: 1,
        username: 'photographer1',
        email: 'photographer1@example.com',
        password: 'hashed_password_1',
        created_at: new Date(),
    },
    {
        id: 2,
        username: 'photographer2',
        email: 'photographer2@example.com',
        password: 'hashed_password_2',
        created_at: new Date(),
    },
];

async function seedDatabase() {
    try {
        for (const hotspot of seedHotspots) {
            await supabase.from('hotspots').insert(hotspot);
        }

        for (const photo of seedPhotos) {
            await supabase.from('photos').insert(photo);
        }

        for (const user of seedUsers) {
            await supabase.from('users').insert(user);
        }

        console.log('Database seeded successfully!');
    } catch (error) {
        console.error('Error seeding database:', error);
    }
}

seedDatabase();