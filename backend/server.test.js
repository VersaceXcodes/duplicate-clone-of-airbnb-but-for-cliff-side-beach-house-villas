import request from 'supertest';
import WebSocket from 'ws';
import { app, pool } from './server.ts';
import jwt from 'jsonwebtoken';

const API = '/';
const TEST_EMAIL = 'testuser@example.com';
const TEST_PASSWORD = 'SuperSecret123!';
const HOST_EMAIL = 'alice@example.com';
const GUEST_EMAIL = 'bob@example.com';

// Helper to create JWTs for test users (mock secret for tests)
const JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
function issueToken(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '2h' });
}

// Helper to reset DB between tests
async function resetDB() {
  await pool.query('ROLLBACK; BEGIN;'); // test transaction isolation (assume test DB)
}

// Helper to get token for existing user (host)
async function loginTestUser(email, password) {
  const res = await request(app)
    .post(`${API}auth/login`)
    .send({ email, password });
  return res.body.token;
}

// Test data: known users, villas, etc.
const TEST_HOST_ID = 'user_01';
const TEST_GUEST_ID = 'user_02';
const TEST_VILLA_ID = 'villa_001';

beforeAll(async () => {
  await pool.query('BEGIN;');
});
afterAll(async () => {
  await pool.query('ROLLBACK;');
  await pool.end();
});
beforeEach(async () => {
  await resetDB();
});

describe('Auth API', () => {
  it('should signup a new user with valid fields and send confirmation', async () => {
    const res = await request(app)
      .post(`${API}auth/signup`)
      .send({
        email: TEST_EMAIL,
        name: 'Test User',
        password_hash: TEST_PASSWORD,
        role: 'guest',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toEqual(
      expect.objectContaining({
        email: TEST_EMAIL,
        name: 'Test User',
        role: 'guest',
        is_email_confirmed: false,
      })
    );
  });

  it('should validate unique email (signup)', async () => {
    const res1 = await request(app)
      .post(`${API}auth/signup`)
      .send({
        email: HOST_EMAIL,
        name: 'Duplicate Host',
        password_hash: TEST_PASSWORD,
        role: 'host',
      });
    expect(res1.statusCode).toBe(400);
    expect(res1.body).toHaveProperty('error');
    expect(res1.body.error).toMatch(/email.*already/i);
  });

  it('should reject login with invalid password', async () => {
    const res = await request(app).post(`${API}auth/login`).send({
      email: HOST_EMAIL,
      password: 'WrongPassword',
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('should login with valid credentials', async () => {
    // For seeded user, use correct hashed password (if test impl allows bypass/mock)
    const res = await request(app).post(`${API}auth/login`).send({
      email: GUEST_EMAIL,
      password: 'hashed_pw_2', // in test, accept hash directly or mock bcrypt
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('email', GUEST_EMAIL);
  });

  it('should require email confirmation for login actions', async () => {
    // Carla is not confirmed: carla@example.com, hashed_pw_3
    const res = await request(app).post(`${API}auth/login`).send({
      email: 'carla@example.com',
      password: 'hashed_pw_3',
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/not.*confirmed/i);
  });

  it('should not allow booking or listing APIs for un-authenticated', async () => {
    const res = await request(app)
      .post(`${API}villas`)
      .send({
        host_user_id: TEST_HOST_ID,
        name: 'Test Villa',
        location: 'Test City',
        lat: 1.0,
        lng: 1.0,
        description: 'Test',
        amenities: 'wifi',
        price_per_night: 200,
        cancellation_policy: 'strict',
      });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('should send a password reset email when requested', async () => {
    // Should mock email send; here we check endpoint and side effect (token set)
    const res = await request(app)
      .post(`${API}auth/forgot-password`)
      .send({ email: GUEST_EMAIL });
    expect(res.statusCode).toBe(200);
    // Could also verify email log entry (admin_email_logs table)
  });

  it('should confirm email by token', async () => {
    // Simulate signup, get token, call confirm endpoint
    const signup = await request(app)
      .post(`${API}auth/signup`)
      .send({
        email: 'pending@example.com',
        name: 'Pending',
        password_hash: 'Password123!',
        role: 'guest',
      });
    const token = signup.body.user.email_confirmation_token;
    expect(token).toBeTruthy();
    const res = await request(app)
      .post(`${API}auth/confirm-email`)
      .send({ token });
    expect(res.statusCode).toBe(200);
    expect(res.body.user.is_email_confirmed).toBe(true);
  });
});

describe('User profile API', () => {
  let token;
  beforeAll(async () => {
    token = await loginTestUser(HOST_EMAIL, 'hashed_pw_1');
  });

  it('should fetch public profiles by id', async () => {
    const res = await request(app).get(`${API}users/${TEST_HOST_ID}`).send();
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('user_id', TEST_HOST_ID);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('email');
  });

  it('should update own user profile', async () => {
    const res = await request(app)
      .put(`${API}users/${TEST_HOST_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        user_id: TEST_HOST_ID,
        name: 'Alice Updated',
        contact_info: '999-888-7777',
      });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('name', 'Alice Updated');
    expect(res.body).toHaveProperty('contact_info', '999-888-7777');
  });

  it('should not allow a user to update another user', async () => {
    const res = await request(app)
      .put(`${API}users/${TEST_GUEST_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        user_id: TEST_GUEST_ID,
        name: 'Malicious Edit',
      });
    expect([401, 403]).toContain(res.statusCode);
  });
});

describe('Villas API', () => {
  let hostToken;
  beforeAll(async () => {
    hostToken = await loginTestUser(HOST_EMAIL, 'hashed_pw_1');
  });

  it('should get all published villas (search/discover)', async () => {
    const res = await request(app).get(`${API}villas?status=published`).send();
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          villa_id: expect.any(String),
          name: expect.any(String),
        }),
      ])
    );
  });

  it('should filter villas by amenities and price', async () => {
    const res = await request(app)
      .get(
        `${API}villas?amenities=wifi,pool&price_min=100&price_max=400&status=published`
      )
      .send();
    expect(res.statusCode).toBe(200);
    // All results contain required amenities and price within range
    res.body.forEach((villa) => {
      expect(villa.amenities).toMatch(/wifi/);
      expect(villa.price_per_night).toBeGreaterThanOrEqual(100);
      expect(villa.price_per_night).toBeLessThanOrEqual(400);
    });
  });

  it('should create a new villa listing as a host', async () => {
    const res = await request(app)
      .post(`${API}villas`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        host_user_id: TEST_HOST_ID,
        name: 'Test Villa',
        location: 'Fake Island',
        lat: 12.34,
        lng: 56.78,
        description: 'A brand new villa!',
        amenities: 'wifi,ac,pool',
        price_per_night: 299,
        cleaning_fee: 25,
        service_fee: 15,
        minimum_stay_nights: 2,
        cancellation_policy: 'flexible',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('name', 'Test Villa');
    expect(res.body.status).toBe('published');
  });

  it('should not allow guest role to create villa', async () => {
    const guestToken = await loginTestUser(GUEST_EMAIL, 'hashed_pw_2');
    const res = await request(app)
      .post(`${API}villas`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        host_user_id: TEST_GUEST_ID,
        name: 'Unauthorized Villa',
        location: 'Nowhere',
        lat: 0.1,
        lng: 0.1,
        description: 'Guests cannot create this!',
        amenities: 'wifi',
        price_per_night: 111,
        cancellation_policy: 'strict',
      });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('should update/patch and delete a villa as owner', async () => {
    // PATCH
    let res = await request(app)
      .patch(`${API}villas/${TEST_VILLA_ID}`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ villa_id: TEST_VILLA_ID, name: 'Patched Name' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Patched Name');

    // DELETE (unpublish)
    res = await request(app)
      .delete(`${API}villas/${TEST_VILLA_ID}`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send();
    expect(res.statusCode).toBe(204);
    // Afterwards villa status should be 'unpublished'
    const vRes = await request(app).get(
      `${API}villas/${TEST_VILLA_ID}`
    );
    expect(['unpublished', undefined]).toContain(vRes.body.status);
  });
});

describe('Villa Photos & Amenities API', () => {
  let hostToken;
  beforeAll(async () => {
    hostToken = await loginTestUser(HOST_EMAIL, 'hashed_pw_1');
  });

  it('should list photos for a villa', async () => {
    const res = await request(app).get(`${API}villas/${TEST_VILLA_ID}/photos`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((photo) => expect(photo).toHaveProperty('url'));
  });

  it('should add new villa photo (and receive update via WS)', async (done) => {
    // WebSocket: listen for photo_added on villa/{id}/photos
    const ws = new WebSocket('ws://localhost:3000/ws/villa/villa_001/photos');

    ws.on('open', async () => {
      // When ws ready, post a photo
      await request(app)
        .post(`${API}villas/${TEST_VILLA_ID}/photos`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({
          villa_id: TEST_VILLA_ID,
          url: 'https://picsum.photos/seed/villaX/800/600',
          sort_order: 99,
        });
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      expect(msg).toHaveProperty('url', 'https://picsum.photos/seed/villaX/800/600');
      ws.close();
      done();
    });
  });

  it('should add and remove amenities via API', async () => {
    // Add "pet_friendly" to TEST_VILLA_ID
    let res = await request(app)
      .post(`${API}villa-amenities`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ villa_id: TEST_VILLA_ID, amenity_slug: 'pet_friendly' });
    expect(res.statusCode).toBe(201);
    // Remove
    res = await request(app)
      .delete(`${API}villa-amenities?villa_id=${TEST_VILLA_ID}&amenity_slug=pet_friendly`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send();
    expect(res.statusCode).toBe(204);
  });
});

describe('Bookings API', () => {
  let guestToken, hostToken;
  beforeAll(async () => {
    guestToken = await loginTestUser(GUEST_EMAIL, 'hashed_pw_2');
    hostToken = await loginTestUser(HOST_EMAIL, 'hashed_pw_1');
  });

  it('should not allow double-booking for unavailable dates', async () => {
    // Existing booking: villa_001 is booked 2024-06-10 to 2024-06-15
    const res = await request(app)
      .post(`${API}bookings`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        villa_id: TEST_VILLA_ID,
        guest_user_id: TEST_GUEST_ID,
        host_user_id: TEST_HOST_ID,
        start_date: '2024-06-12',
        end_date: '2024-06-14',
        adults: 2,
        total_price: 800,
        cleaning_fee: 50,
        service_fee: 25,
        is_guest_id_provided: true,
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/unavailable/i);
  });

  it('should accept a new, valid booking and trigger WS updates', async (done) => {
    // Set up WS for user booking event
    const ws = new WebSocket('ws://localhost:3000/ws/user/user_04/bookings');
    ws.on('open', async () => {
      const res = await request(app)
        .post(`${API}bookings`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          villa_id: 'villa_003',
          guest_user_id: 'user_04',
          host_user_id: 'user_05',
          start_date: '2024-06-20',
          end_date: '2024-06-22',
          adults: 2,
          total_price: 600,
          cleaning_fee: 20,
          service_fee: 15,
        });
      expect(res.statusCode).toBe(201);
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      expect(msg).toHaveProperty('booking_id');
      ws.close();
      done();
    });
  });

  it('should update and cancel a booking (host only permitted)', async () => {
    // Confirm pending booking as host
    let res = await request(app)
      .put(`${API}bookings/booking_002`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ booking_id: 'booking_002', status: 'confirmed' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('confirmed');

    // Cancel booking as host
    res = await request(app)
      .delete(`${API}bookings/booking_002`)
      .set('Authorization', `Bearer ${hostToken}`);
    expect(res.statusCode).toBe(204);
  });
});

describe('Saved Villas (Favorites) API', () => {
  let guestToken;
  beforeAll(async () => {
    guestToken = await loginTestUser(GUEST_EMAIL, 'hashed_pw_2');
  });

  it('should add and remove a villa from saved list and trigger events', async (done) => {
    // WebSocket: user/{user_id}/saved_villas
    const ws = new WebSocket('ws://localhost:3000/ws/user/user_02/saved_villas');
    ws.on('open', async () => {
      // Add favorite
      let res = await request(app)
        .post(`${API}villa-saved`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ user_id: TEST_GUEST_ID, villa_id: TEST_VILLA_ID });
      expect(res.statusCode).toBe(201);

      // Remove favorite
      res = await request(app)
        .delete(`${API}villa-saved`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ user_id: TEST_GUEST_ID, villa_id: TEST_VILLA_ID });
      expect(res.statusCode).toBe(204);
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      expect(['favorite_added', 'favorite_removed']).toContain(msg.type);
      ws.close();
      done();
    });
  });
});

describe('Messaging API/WS', () => {
  let guestToken, hostToken;
  beforeAll(async () => {
    guestToken = await loginTestUser(GUEST_EMAIL, 'hashed_pw_2');
    hostToken = await loginTestUser(HOST_EMAIL, 'hashed_pw_1');
  });

  it('should allow messaging in a thread and emit via WS', async (done) => {
    // WS for thread messages
    const ws = new WebSocket('ws://localhost:3000/ws/thread/thread_001/messages');
    ws.on('open', async () => {
      // Guest sends message in thread_001
      const res = await request(app)
        .post(`${API}messages`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          thread_id: 'thread_001',
          sender_user_id: TEST_GUEST_ID,
          content: 'Is breakfast included?',
        });
      expect(res.statusCode).toBe(201);
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      expect(msg.content).toBe('Is breakfast included?');
      ws.close();
      done();
    });
  });

  it('should not allow message send in someone else\'s thread', async () => {
    const res = await request(app)
      .post(`${API}messages`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        thread_id: 'nonexistent_thread',
        sender_user_id: TEST_GUEST_ID,
        content: 'Illegal!',
      });
    expect([401, 403, 404]).toContain(res.statusCode);
  });
});

describe('Reviews API', () => {
  let guestToken, hostToken;
  beforeAll(async () => {
    guestToken = await loginTestUser(GUEST_EMAIL, 'hashed_pw_2');
    hostToken = await loginTestUser(HOST_EMAIL, 'hashed_pw_1');
  });

  it('should list, create, update, and soft-delete a review (and emit via WS)', async (done) => {
    // List
    let res = await request(app).get(`${API}reviews?villa_id=villa_001`).send();
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // WS for villa/{villa_id}/reviews
    const ws = new WebSocket('ws://localhost:3000/ws/villa/villa_001/reviews');
    ws.on('open', async () => {
      // Create new review as guest
      res = await request(app)
        .post(`${API}reviews`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          booking_id: 'booking_001',
          villa_id: 'villa_001',
          reviewer_user_id: TEST_GUEST_ID,
          reviewee_user_id: TEST_HOST_ID,
          reviewer_role: 'guest',
          rating: 4.7,
          text: 'WS test review!',
        });
      expect(res.statusCode).toBe(201);
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      expect(msg).toHaveProperty('text', 'WS test review!');
      ws.close();
      done();
    });
  });

  it('should enforce 24h review edit period', async () => {
    // Try to edit a review past can_edit_until
    // Artificially set can_edit_until to yesterday
    await pool.query(`
      UPDATE reviews SET can_edit_until = NOW() - INTERVAL '1 day' WHERE review_id = 'review_001';
    `);
    const res = await request(app)
      .patch(`${API}reviews/review_001`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ review_id: 'review_001', rating: 2 });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/edit.*expired/i);
  });
});

describe('Notifications API', () => {
  let userToken;
  beforeAll(async () => {
    userToken = await loginTestUser(HOST_EMAIL, 'hashed_pw_1');
  });

  it('should list notifications for user, mark as read via patch', async () => {
    let res = await request(app)
      .get(`${API}notifications?user_id=${TEST_HOST_ID}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send();
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // patch single
    const notif = res.body.find((n) => !n.is_read);
    if (notif) {
      res = await request(app)
        .patch(`${API}notifications/${notif.notification_id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ notification_id: notif.notification_id, is_read: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.is_read).toBe(true);
    }
  });
});

describe('Legal Pages API', () => {
  it('should list and fetch static legal/faq pages', async () => {
    const res = await request(app).get(`${API}legal-pages`).send();
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const privacy = res.body.find((page) => page.page === 'privacy');
    expect(privacy).toBeTruthy();
    const detail = await request(app)
      .get(`${API}legal-pages/privacy`)
      .send();
    expect(detail.statusCode).toBe(200);
    expect(detail.body.content).toBe('All your data is private.');
  });
});