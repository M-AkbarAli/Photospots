import request from 'supertest';
import app from '../../src/app';

describe('API Integration Tests', () => {
  it('should return a list of hotspots', async () => {
    const response = await request(app).get('/api/hotspots');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('should create a new hotspot', async () => {
    const newHotspot = {
      title: 'Test Hotspot',
      description: 'A beautiful place to take photos.',
      latitude: 34.0522,
      longitude: -118.2437,
      category: 'landscape',
    };

    const response = await request(app)
      .post('/api/hotspots')
      .send(newHotspot);
    
    expect(response.status).toBe(201);
    expect(response.body.title).toBe(newHotspot.title);
  });

  it('should return a specific hotspot', async () => {
    const hotspotId = '1'; // Replace with a valid hotspot ID
    const response = await request(app).get(`/api/hotspots/${hotspotId}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(hotspotId);
  });

  it('should return 404 for a non-existent hotspot', async () => {
    const response = await request(app).get('/api/hotspots/999');
    expect(response.status).toBe(404);
  });

  it('should return photos for a specific hotspot', async () => {
    const hotspotId = '1'; // Replace with a valid hotspot ID
    const response = await request(app).get(`/api/hotspots/${hotspotId}/photos`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('should return search results based on keywords', async () => {
    const response = await request(app).get('/api/search?query=landscape');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});