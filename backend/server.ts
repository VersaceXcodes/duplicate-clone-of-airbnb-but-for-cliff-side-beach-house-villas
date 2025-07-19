import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// Import Zod Schemas 
import * as Schemas from './schema.ts';

// Postgres config (do not change)
import pkg from 'pg';
const { Pool } = pkg;
const { DATABASE_URL, PGHOST, PGDATABASE, PGUSER, PGPASSWORD, PGPORT = 5432, JWT_SECRET = "my_jwt_secret", PORT = 3000 } = process.env;

const pool = new Pool(
  DATABASE_URL
    ? { 
        connectionString: DATABASE_URL, 
        ssl: { require: true } 
      }
    : {
        host: PGHOST,
        database: PGDATABASE,
        user: PGUSER,
        password: PGPASSWORD,
        port: Number(PGPORT),
        ssl: { require: true },
      }
);

// ESM workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// EXPRESS SETUP
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// ===== Utility functions for IDs & Timestamps =====
function newId(prefix) {
  return `${prefix}_${uuidv4().replace(/-/g, '')}`;
}
function nowISO() {
  return new Date().toISOString();
}

// ========== JWT & Auth Middleware ==========

function signJwt(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '21d' }
  );
}

function authRequired(req, res, next) {
  // Auth header: Bearer <token>
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ error: 'Missing token' });
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = payload;
    next();
  });
}

function reqUserId(req) {
  return req.user?.user_id;
}
function reqUserRole(req) {
  return req.user?.role;
}

// ========== Password Hashing Helpers ==========
const SALT_ROUNDS = 10;
async function hashPass(pass) {
  return bcrypt.hash(pass, SALT_ROUNDS);
}
async function checkPass(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ========== Email Logic (mocked) ==========
/*
  @@need:external-api: Email sending for confirmations & password reset
*/
function mockSendEmail({ to, type, token, subject, content }) {
  // In real impl, use nodemailer/sendgrid/etc. Here, just log and store in `admin_email_logs`
  // called inside transactional flows (returns token or true for success).
  // If sending booking/message/review notifications: type='notify_xxx'.
}

// ========== Standard Error Handler ==========
function handleError(res, error, code = 400) {
  if (error instanceof z.ZodError) {
    return res.status(422).json({ error: "Validation error", details: error.errors });
  }
  if (typeof error === 'string') return res.status(code).json({ error });
  if (error && error.message) return res.status(code).json({ error: error.message });
  return res.status(code).json({ error: 'Unknown error' });
}

// ========== REST API Implementation ==========

/**
 * --------------------------
 * Auth Endpoints
 * --------------------------
 */

// Signup
app.post('/auth/signup', async (req, res) => {
  try {
    const input = Schemas.createUserInputSchema.parse(req.body);
    const emailLower = input.email.toLowerCase();

    // Check uniqueness
    const client = await pool.connect();
    const { rows } = await client.query('SELECT user_id FROM users WHERE email = $1', [emailLower]);
    if (rows.length > 0) {
      client.release();
      return handleError(res, "Email already registered", 409);
    }

    // Hash password
    const pwHash = await hashPass(input.password_hash);
    const user_id = newId('user');
    const created_at = nowISO();
    const updated_at = created_at;
    const is_email_confirmed = false; // Unconfirmed
    const email_confirmation_token = uuidv4();

    await client.query(`
      INSERT INTO users (
        user_id, email, name, password_hash, role, profile_photo_url, 
        contact_info, host_bio, is_email_confirmed, email_confirmation_token, created_at, updated_at,
        has_unread_messages, has_unread_notifications
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        false,false
      )
    `, [
      user_id, emailLower, input.name, pwHash, input.role,
      input.profile_photo_url ?? null, input.contact_info ?? null, input.host_bio ?? null,
      is_email_confirmed, email_confirmation_token, created_at, updated_at
    ]);

    // Mock send email
    mockSendEmail({
      to: emailLower,
      type: 'confirm_email',
      token: email_confirmation_token,
      subject: 'CliffBnb: Confirm your email',
      content: `Click to confirm: https://cliffbnb.com/confirm?token=${email_confirmation_token}`
    });

    // Fetch inserted user for output
    const outres = await client.query('SELECT * FROM users WHERE user_id=$1', [user_id]);
    client.release();
    let user = outres.rows[0];
    user = Schemas.userSchema.parse({
      ...user,
      created_at: new Date(user.created_at),
      updated_at: new Date(user.updated_at)
    });
    // Return JWT
    const token = signJwt(user);
    return res.status(201).json({ token, user });
  } catch (e) {
    return handleError(res, e);
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = Schemas.z.object({ email: z.string().email(), password: z.string().min(8) }).parse(req.body);
    const client = await pool.connect();
    const { rows } = await client.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    client.release();
    if (!rows.length) return handleError(res, "Invalid credentials", 401);
    const user = rows[0];
    if (!await checkPass(password, user.password_hash)) {
      return handleError(res, "Invalid credentials", 401);
    }
    if (!user.is_email_confirmed) {
      return handleError(res, "Email not confirmed", 403);
    }
    const zUser = Schemas.userSchema.parse({
      ...user,
      created_at: new Date(user.created_at),
      updated_at: new Date(user.updated_at)
    });
    const token = signJwt(zUser);
    return res.json({ token, user: zUser });
  } catch (e) {
    return handleError(res, e);
  }
});

// Email confirmation 
app.post('/auth/confirm-email', async (req, res) => {
  try {
    const { token } = Schemas.z.object({ token: z.string() }).parse(req.body);
    const client = await pool.connect();
    const { rows } = await client.query('SELECT * FROM users WHERE email_confirmation_token=$1', [token]);
    if (!rows.length) {
      client.release();
      return handleError(res, "Invalid token", 400);
    }
    const user = rows[0];
    // Set to confirmed, clear token
    await client.query(`UPDATE users SET is_email_confirmed = TRUE, email_confirmation_token=NULL, updated_at=$2 WHERE user_id=$1`,
      [user.user_id, nowISO()]
    );
    const { rows: outrows } = await client.query('SELECT * FROM users WHERE user_id=$1', [user.user_id]);
    client.release();
    const zUser = Schemas.userSchema.parse({
      ...outrows[0],
      created_at: new Date(outrows[0].created_at),
      updated_at: new Date(outrows[0].updated_at)
    });
    const jwtToken = signJwt(zUser);
    return res.json({ token: jwtToken, user: zUser });
  } catch (e) {
    return handleError(res, e);
  }
});

// Forgot password
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = Schemas.z.object({ email: z.string().email() }).parse(req.body);
    // Find user, store token, 'send' email
    const reset_token = uuidv4();
    const client = await pool.connect();
    const { rows } = await client.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    if (!rows.length) {
      client.release();
      // For privacy, do not reveal non-existence
      return res.sendStatus(200);
    }
    await client.query('UPDATE users SET password_reset_token=$1, updated_at=$3 WHERE email=$2',
      [reset_token, email.toLowerCase(), nowISO()]
    );
    mockSendEmail({
      to: email,
      type: 'reset_password',
      token: reset_token,
      subject: 'CliffBnb: Reset your password',
      content: `Reset link: https://cliffbnb.com/reset?token=${reset_token}`
    });
    client.release();
    return res.sendStatus(200);
  } catch (e) {
    return handleError(res, e);
  }
});

// Reset password via token
app.post('/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = Schemas.z.object({
      token: z.string(),
      password: z.string().min(8)
    }).parse(req.body);

    const client = await pool.connect();
    const { rows } = await client.query('SELECT * FROM users WHERE password_reset_token=$1', [token]);
    if (!rows.length) {
      client.release();
      return handleError(res, "Invalid token", 400);
    }
    const pwHash = await hashPass(password);
    // Set hash, clear token, update updated_at
    await client.query('UPDATE users SET password_hash=$1, password_reset_token=NULL, updated_at=$3 WHERE user_id=$2',
      [pwHash, rows[0].user_id, nowISO()]);
    // Fetch for output
    const { rows: outrows } = await client.query('SELECT * FROM users WHERE user_id=$1', [rows[0].user_id]);
    client.release();
    const zUser = Schemas.userSchema.parse({
        ...outrows[0],
        created_at: new Date(outrows[0].created_at),
        updated_at: new Date(outrows[0].updated_at)
    });
    const jwtToken = signJwt(zUser);
    return res.json({ token: jwtToken, user: zUser });
  } catch(e) {
    return handleError(res, e);
  }
});

// Logout = noop (stateless JWT)
app.post('/auth/logout', (req, res) => {
  return res.sendStatus(204);
});

/**
 * --------------------------
 * User Profile CRUD
 * --------------------------
 */

// GET /users/{user_id} public profile
app.get('/users/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const client = await pool.connect();
    const { rows } = await client.query('SELECT * FROM users WHERE user_id=$1', [user_id]);
    client.release();
    if (!rows.length) return handleError(res, "User not found", 404);
    const user = Schemas.userSchema.parse({
      ...rows[0],
      created_at: new Date(rows[0].created_at),
      updated_at: new Date(rows[0].updated_at)
    });
    return res.json(user);
  } catch (e) {
    return handleError(res, e);
  }
});

// Update full user
app.put('/users/:user_id', authRequired, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (reqUserId(req) !== user_id) return handleError(res, "Forbidden", 403);
    const input = Schemas.updateUserInputSchema.parse({ ...req.body, user_id });
    const fields = Object.keys(input).filter(k => k !== 'user_id');
    if (fields.length === 0) return handleError(res, "Nothing to update");
    const qs = fields.map((k, i) => `${k}=$${i + 2}`).join(',');
    const vals = fields.map(k => input[k]);
    vals.push(nowISO()); // updated_at
    const client = await pool.connect();
    await client.query(
      `UPDATE users SET ${qs}, updated_at=$${fields.length+2} WHERE user_id=$1`,
      [user_id, ...vals]
    );
    const { rows } = await client.query('SELECT * FROM users WHERE user_id=$1', [user_id]);
    client.release();
    const user = Schemas.userSchema.parse({
      ...rows[0],
      created_at: new Date(rows[0].created_at),
      updated_at: new Date(rows[0].updated_at)
    });
    return res.json(user);
  } catch (e) {
    return handleError(res, e);
  }
});

// Patch user fields
app.patch('/users/:user_id', authRequired, async (req, res) => {
  try {
    const { user_id } = req.params;
    if (reqUserId(req) !== user_id) return handleError(res, "Forbidden", 403);
    const input = Schemas.updateUserInputSchema.parse({ ...req.body, user_id });
    const fields = Object.keys(input).filter(k => k !== 'user_id');
    if (fields.length === 0) return handleError(res, "Nothing to update");
    const qs = fields.map((k, i) => `${k}=$${i + 2}`).join(',');
    const vals = fields.map(k => input[k]);
    vals.push(nowISO()); // updated_at
    const client = await pool.connect();
    await client.query(
      `UPDATE users SET ${qs}, updated_at=$${fields.length+2} WHERE user_id=$1`,
      [user_id, ...vals]
    );
    const { rows } = await client.query('SELECT * FROM users WHERE user_id=$1', [user_id]);
    client.release();
    const user = Schemas.userSchema.parse({
      ...rows[0],
      created_at: new Date(rows[0].created_at),
      updated_at: new Date(rows[0].updated_at)
    });
    return res.json(user);
  } catch (e) {
    return handleError(res, e);
  }
});

// Authenticated user dashboard/profile
app.get('/users/me', authRequired, async (req, res) => {
  try {
    const user_id = reqUserId(req);
    const client = await pool.connect();
    const { rows } = await client.query('SELECT * FROM users WHERE user_id=$1', [user_id]);
    client.release();
    if (!rows.length) return handleError(res, "User not found", 404);
    const user = Schemas.userSchema.parse({
        ...rows[0],
        created_at: new Date(rows[0].created_at),
        updated_at: new Date(rows[0].updated_at)
    });
    return res.json(user);
  } catch (e) {
    return handleError(res, e);
  }
});

// Search all users (admin)
app.get('/users', authRequired, async (req, res) => {
  try {
    if (reqUserRole(req) !== 'admin') return handleError(res, "Forbidden", 403);
    const q = Schemas.searchUserInputSchema.parse(req.query);
    const wh = [];
    const vals = [];
    let i = 1;
    if (q.query) { wh.push(`(name ILIKE $${i} OR email ILIKE $${i})`); vals.push('%'+q.query+'%'); i++; }
    if (q.role) { wh.push(`role=$${i}`); vals.push(q.role); i++; }
    if (typeof q.is_email_confirmed === 'boolean') { wh.push(`is_email_confirmed=$${i}`); vals.push(q.is_email_confirmed); i++; }
    let where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
    let sort = `ORDER BY ${q.sort_by} ${q.sort_order}`;
    const sql = `SELECT * FROM users ${where} ${sort} LIMIT $${i} OFFSET $${i+1}`;
    vals.push(q.limit, q.offset);
    const client = await pool.connect();
    const { rows } = await client.query(sql, vals);
    client.release();
    const out = rows.map(u => Schemas.userSchema.parse({
      ...u, created_at: new Date(u.created_at), updated_at: new Date(u.updated_at)
    }));
    return res.json(out);
  } catch(e) {
    return handleError(res, e);
  }
});

/**
 * --------------------------
 * Villas (CRUD, Search, Photos, Amenity, Availability)
 * --------------------------
 */

// SEARCH /villas
app.get('/villas', async (req, res) => {
  try {
    // Parse/validate query
    let {
      location, amenities, start_date, end_date, price_min, price_max, status,
      sort_by = 'created_at', sort_order = 'desc', page = 1, limit = 10, offset = 0,
      ne_lat, ne_lng, sw_lat, sw_lng
    } = req.query;

    // Compose SQL
    let i = 1, wh = [], vals = [];
    if (location) { wh.push(`location ILIKE $${i}`); vals.push('%' + location + '%'); i++; }
    if (status) { wh.push(`status=$${i}`); vals.push(status); i++; }

    // Map bounds for list/map toggle
    if (sw_lat && ne_lat) { wh.push(`lat BETWEEN $${i} AND $${i+1}`); vals.push(Number(sw_lat), Number(ne_lat)); i += 2; }
    if (sw_lng && ne_lng) { wh.push(`lng BETWEEN $${i} AND $${i+1}`); vals.push(Number(sw_lng), Number(ne_lng)); i += 2; }

    if (price_min) { wh.push(`price_per_night >= $${i}`); vals.push(Number(price_min)); i++; }
    if (price_max) { wh.push(`price_per_night <= $${i}`); vals.push(Number(price_max)); i++; }
    // Amenities (comma separated list)
    let base = `SELECT * FROM villas`;
    let where = wh.length ? (' WHERE ' + wh.join(' AND ')) : '';
    // Order/limit
    let sql = `${base}${where} ORDER BY ${sort_by} ${sort_order} LIMIT $${i} OFFSET $${i+1}`;
    vals.push(Number(limit), Number(offset)); i += 2;
    const client = await pool.connect();
    let rows = (await client.query(sql, vals)).rows;
    // Filter for amenities post-query
    if (amenities) {
      const amenArr = amenities.split(',');
      rows = rows.filter(villa => {
        const available = (villa.amenities || '').split(',');
        return amenArr.every(a => available.includes(a));
      });
    }

    const out = rows.map(r => Schemas.villaSchema.parse({
      ...r,
      lat: Number(r.lat), lng: Number(r.lng),
      price_per_night: Number(r.price_per_night),
      cleaning_fee: Number(r.cleaning_fee),
      service_fee: Number(r.service_fee),
      minimum_stay_nights: Number(r.minimum_stay_nights),
      occupancy: Number(r.occupancy),
      average_rating: Number(r.average_rating),
      review_count: Number(r.review_count),
      created_at: new Date(r.created_at),
      updated_at: new Date(r.updated_at)
    }));

    client.release();
    return res.json(out);
  } catch (e) {
    return handleError(res, e);
  }
});

// CREATE villa (host only)
app.post('/villas', authRequired, async (req, res) => {
  try {
    if (reqUserRole(req) !== 'host' && reqUserRole(req) !== 'admin')
      return handleError(res, "Only hosts can list new villas", 403);
    const input = Schemas.createVillaInputSchema.parse(req.body);

    const villa_id = newId('villa');
    const created_at = nowISO();
    const updated_at = created_at;

    const client = await pool.connect();
    await client.query(`
      INSERT INTO villas (villa_id, host_user_id, name, subtitle, location, lat, lng, address, description, 
        house_rules, special_notes, amenities, price_per_night, cleaning_fee, service_fee, minimum_stay_nights, 
        cancellation_policy, status, occupancy, average_rating, review_count, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,0,$20,$21)
    `, [
      villa_id, input.host_user_id, input.name, input.subtitle ?? null, input.location, input.lat, input.lng, input.address ?? null,
      input.description, input.house_rules ?? null, input.special_notes ?? null, input.amenities,
      input.price_per_night, input.cleaning_fee ?? 0, input.service_fee ?? 0, input.minimum_stay_nights ?? 1,
      input.cancellation_policy, input.status ?? 'published', input.occupancy ?? 1, created_at, updated_at
    ]);
    const { rows } = await client.query('SELECT * FROM villas WHERE villa_id=$1', [villa_id]);
    client.release();
    const villa = Schemas.villaSchema.parse({
      ...rows[0],
      lat: Number(rows[0].lat), lng: Number(rows[0].lng),
      price_per_night: Number(rows[0].price_per_night),
      cleaning_fee: Number(rows[0].cleaning_fee),
      service_fee: Number(rows[0].service_fee),
      minimum_stay_nights: Number(rows[0].minimum_stay_nights),
      occupancy: Number(rows[0].occupancy),
      average_rating: Number(rows[0].average_rating),
      review_count: Number(rows[0].review_count),
      created_at: new Date(rows[0].created_at), updated_at: new Date(rows[0].updated_at)
    });

    // Emit realtime to /villas/updated
    io.emit("villas/updated", { type: "villa_created", payload: villa });
    return res.status(201).json(villa);
  } catch (e) {
    return handleError(res, e);
  }
});

// ... continued below