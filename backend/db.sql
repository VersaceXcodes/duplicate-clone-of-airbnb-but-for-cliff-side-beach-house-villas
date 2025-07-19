-- USERS TABLE
CREATE TABLE users (
    user_id VARCHAR PRIMARY KEY,
    email VARCHAR NOT NULL UNIQUE,
    name VARCHAR NOT NULL,
    password_hash VARCHAR NOT NULL,
    role VARCHAR NOT NULL,
    profile_photo_url VARCHAR,
    contact_info VARCHAR,
    host_bio VARCHAR,
    is_email_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    email_confirmation_token VARCHAR,
    password_reset_token VARCHAR,
    has_unread_messages BOOLEAN NOT NULL DEFAULT FALSE,
    has_unread_notifications BOOLEAN NOT NULL DEFAULT FALSE,
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL
);

-- VILLAS TABLE
CREATE TABLE villas (
    villa_id VARCHAR PRIMARY KEY,
    host_user_id VARCHAR NOT NULL REFERENCES users(user_id),
    name VARCHAR NOT NULL,
    subtitle VARCHAR,
    location VARCHAR NOT NULL,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    address VARCHAR,
    description TEXT NOT NULL,
    house_rules TEXT,
    special_notes TEXT,
    amenities VARCHAR NOT NULL,
    price_per_night NUMERIC NOT NULL,
    cleaning_fee NUMERIC NOT NULL DEFAULT 0,
    service_fee NUMERIC NOT NULL DEFAULT 0,
    minimum_stay_nights INTEGER NOT NULL DEFAULT 1,
    cancellation_policy VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'published',
    occupancy INTEGER NOT NULL DEFAULT 1,
    average_rating NUMERIC NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL
);

-- VILLA_PHOTOS TABLE
CREATE TABLE villa_photos (
    photo_id VARCHAR PRIMARY KEY,
    villa_id VARCHAR NOT NULL REFERENCES villas(villa_id),
    url VARCHAR NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at VARCHAR NOT NULL
);

-- VILLA_AVAILABILITY TABLE
CREATE TABLE villa_availability (
    availability_id VARCHAR PRIMARY KEY,
    villa_id VARCHAR NOT NULL REFERENCES villas(villa_id),
    date VARCHAR NOT NULL,
    is_available BOOLEAN NOT NULL,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at VARCHAR NOT NULL
);

-- VILLA_AMENITIES (M:N) TABLE
CREATE TABLE villa_amenities (
    villa_id VARCHAR NOT NULL REFERENCES villas(villa_id),
    amenity_slug VARCHAR NOT NULL REFERENCES amenities(slug),
    PRIMARY KEY (villa_id, amenity_slug)
);

-- VILLA_SAVED TABLE
CREATE TABLE villa_saved (
    user_id VARCHAR NOT NULL REFERENCES users(user_id),
    villa_id VARCHAR NOT NULL REFERENCES villas(villa_id),
    saved_at VARCHAR NOT NULL,
    PRIMARY KEY (user_id, villa_id)
);

-- BOOKINGS TABLE
CREATE TABLE bookings (
    booking_id VARCHAR PRIMARY KEY,
    villa_id VARCHAR NOT NULL REFERENCES villas(villa_id),
    guest_user_id VARCHAR NOT NULL REFERENCES users(user_id),
    host_user_id VARCHAR NOT NULL REFERENCES users(user_id),
    start_date VARCHAR NOT NULL,
    end_date VARCHAR NOT NULL,
    adults INTEGER NOT NULL,
    children INTEGER NOT NULL DEFAULT 0,
    infants INTEGER NOT NULL DEFAULT 0,
    total_price NUMERIC NOT NULL,
    cleaning_fee NUMERIC NOT NULL,
    service_fee NUMERIC NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'pending',
    cancellation_reason VARCHAR,
    payment_status VARCHAR NOT NULL DEFAULT 'pending',
    is_guest_id_provided BOOLEAN NOT NULL DEFAULT FALSE,
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL
);

-- REVIEWS TABLE
CREATE TABLE reviews (
    review_id VARCHAR PRIMARY KEY,
    booking_id VARCHAR NOT NULL REFERENCES bookings(booking_id),
    villa_id VARCHAR NOT NULL REFERENCES villas(villa_id),
    reviewer_user_id VARCHAR NOT NULL REFERENCES users(user_id),
    reviewee_user_id VARCHAR NOT NULL REFERENCES users(user_id),
    reviewer_role VARCHAR NOT NULL,
    rating NUMERIC NOT NULL,
    text VARCHAR,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL,
    can_edit_until VARCHAR
);

-- MESSAGE_THREADS TABLE
CREATE TABLE message_threads (
    thread_id VARCHAR PRIMARY KEY,
    villa_id VARCHAR REFERENCES villas(villa_id),
    booking_id VARCHAR REFERENCES bookings(booking_id),
    participant_user_ids VARCHAR NOT NULL,
    last_message_at VARCHAR,
    unread_counts VARCHAR,
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL
);

-- MESSAGES TABLE
CREATE TABLE messages (
    message_id VARCHAR PRIMARY KEY,
    thread_id VARCHAR NOT NULL REFERENCES message_threads(thread_id),
    sender_user_id VARCHAR NOT NULL REFERENCES users(user_id),
    content TEXT NOT NULL,
    sent_at VARCHAR NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE
);

-- NOTIFICATIONS TABLE
CREATE TABLE notifications (
    notification_id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(user_id),
    type VARCHAR NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at VARCHAR NOT NULL
);

-- PAYOUTS TABLE
CREATE TABLE payouts (
    payout_id VARCHAR PRIMARY KEY,
    host_user_id VARCHAR NOT NULL REFERENCES users(user_id),
    booking_id VARCHAR REFERENCES bookings(booking_id),
    amount NUMERIC NOT NULL,
    status VARCHAR NOT NULL,
    payout_method VARCHAR NOT NULL,
    details TEXT,
    payout_date VARCHAR,
    created_at VARCHAR NOT NULL
);

-- PAYOUT_METHODS TABLE
CREATE TABLE payout_methods (
    payout_method_id VARCHAR PRIMARY KEY,
    host_user_id VARCHAR NOT NULL REFERENCES users(user_id),
    method VARCHAR NOT NULL,
    details TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL
);

-- ADMIN_EMAIL_LOGS TABLE
CREATE TABLE admin_email_logs (
    log_id VARCHAR PRIMARY KEY,
    user_id VARCHAR REFERENCES users(user_id),
    to_email VARCHAR NOT NULL,
    type VARCHAR NOT NULL,
    subject VARCHAR NOT NULL,
    content TEXT NOT NULL,
    sent_at VARCHAR NOT NULL
);

-- AMENITIES TABLE
CREATE TABLE amenities (
    slug VARCHAR PRIMARY KEY,
    label VARCHAR NOT NULL,
    icon_url VARCHAR
);

-- SEARCH_QUERIES TABLE
CREATE TABLE search_queries (
    search_id VARCHAR PRIMARY KEY,
    user_id VARCHAR REFERENCES users(user_id),
    location VARCHAR,
    start_date VARCHAR,
    end_date VARCHAR,
    adults INTEGER,
    children INTEGER,
    infants INTEGER,
    price_min NUMERIC,
    price_max NUMERIC,
    amenities VARCHAR,
    sort_by VARCHAR,
    map_bounds VARCHAR,
    page INTEGER,
    view_mode VARCHAR,
    created_at VARCHAR NOT NULL
);

-- LEGAL_PAGES TABLE
CREATE TABLE legal_pages (
    page VARCHAR PRIMARY KEY,
    title VARCHAR NOT NULL,
    content TEXT NOT NULL,
    updated_at VARCHAR NOT NULL
);

-- SEED DATA

-- Users Seed
INSERT INTO users (user_id, email, name, password_hash, role, profile_photo_url, contact_info, host_bio, is_email_confirmed, has_unread_messages, has_unread_notifications, created_at, updated_at)
VALUES
('user_01', 'alice@example.com', 'Alice Jordan', 'hashed_pw_1', 'host', 'https://picsum.photos/seed/alice/200/200', '123-456-7890', 'I love hosting at seaside!', TRUE, FALSE, FALSE, '2024-06-01T10:00:00Z', '2024-06-01T10:00:00Z'),
('user_02', 'bob@example.com', 'Bob Smith', 'hashed_pw_2', 'guest', 'https://picsum.photos/seed/bob/200/200', NULL, NULL, TRUE, TRUE, FALSE, '2024-06-01T12:00:00Z', '2024-06-01T12:00:00Z'),
('user_03', 'carla@example.com', 'Carla Morrison', 'hashed_pw_3', 'host', NULL, '456-123-0009', 'Creative host in the mountains', FALSE, FALSE, FALSE, '2024-06-01T14:00:00Z', '2024-06-01T14:00:00Z'),
('user_04', 'david@example.com', 'David Lee', 'hashed_pw_4', 'guest', NULL, NULL, NULL, TRUE, FALSE, TRUE, '2024-06-01T16:00:00Z', '2024-06-01T16:00:00Z'),
('user_05', 'eva@example.com', 'Eva Green', 'hashed_pw_5', 'host', 'https://picsum.photos/seed/eva/200/200', '555-333-6789', 'Urban chic with a garden', FALSE, FALSE, FALSE, '2024-06-02T09:00:00Z', '2024-06-02T09:00:00Z');

-- Amenities Seed
INSERT INTO amenities (slug, label, icon_url) VALUES
('wifi', 'Wi-Fi', 'https://picsum.photos/seed/wifi/40/40'),
('pool', 'Swimming Pool', 'https://picsum.photos/seed/pool/40/40'),
('parking', 'Free Parking', 'https://picsum.photos/seed/parking/40/40'),
('kitchen', 'Kitchen', 'https://picsum.photos/seed/kitchen/40/40'),
('pet_friendly', 'Pet Friendly', 'https://picsum.photos/seed/pet_friendly/40/40'),
('ac', 'Air Conditioning', 'https://picsum.photos/seed/ac/40/40');

-- Villas Seed
INSERT INTO villas (
    villa_id, host_user_id, name, subtitle, location, lat, lng, address, description, house_rules, special_notes, amenities, price_per_night, cleaning_fee, service_fee, minimum_stay_nights, cancellation_policy, status, occupancy, average_rating, review_count, created_at, updated_at
) VALUES
('villa_001', 'user_01', 'Seaside Villa', 'Relax by the beach', 'Santorini, Greece', 36.3932, 25.4615, '123 White Beach Rd', 'A beautiful seaside villa with ocean views.', 'No smoking. No parties.', 'Welcome drink included.', 'wifi,pool,parking', 350, 50, 25, 2, 'flexible', 'published', 6, 4.88, 10, '2024-06-01T11:00:00Z', '2024-06-01T11:00:00Z'),
('villa_002', 'user_03', 'Mountain Escape', NULL, 'Aspen, USA', 39.1911, -106.8175, '789 Pine Mountain Dr', 'Charming log cabin with mountain views.', 'No shoes inside.', NULL, 'wifi,parking,kitchen,ac', 420, 60, 30, 3, 'moderate', 'published', 8, 4.95, 23, '2024-06-02T15:00:00Z', '2024-06-02T15:00:00Z'),
('villa_003', 'user_05', 'Urban Oasis', 'Luxury in the city center', 'Paris, France', 48.8566, 2.3522, '202 Rue du Jardin', 'Modern villa with private garden and city views.', 'Quiet hours after 10pm.', 'Early bird discount.', 'wifi,ac,pet_friendly,parking', 299, 20, 15, 1, 'strict', 'published', 4, 0, 0, '2024-06-03T09:00:00Z', '2024-06-03T09:00:00Z');

-- Villa Photos Seed
INSERT INTO villa_photos (photo_id, villa_id, url, sort_order, created_at) VALUES
('photo_001', 'villa_001', 'https://picsum.photos/seed/villa1_1/800/600', 1, '2024-06-01T11:01:00Z'),
('photo_002', 'villa_001', 'https://picsum.photos/seed/villa1_2/800/600', 2, '2024-06-01T11:02:00Z'),
('photo_003', 'villa_002', 'https://picsum.photos/seed/villa2_1/800/600', 1, '2024-06-02T15:01:00Z'),
('photo_004', 'villa_003', 'https://picsum.photos/seed/villa3_1/800/600', 1, '2024-06-03T09:01:00Z');

-- Villa Availability Seed
INSERT INTO villa_availability (availability_id, villa_id, date, is_available, is_blocked, created_at) VALUES
('avail_001', 'villa_001', '2024-06-10', TRUE, FALSE, '2024-06-01T11:10:00Z'),
('avail_002', 'villa_001', '2024-06-11', TRUE, FALSE, '2024-06-01T11:10:00Z'),
('avail_003', 'villa_002', '2024-06-10', FALSE, TRUE, '2024-06-02T15:10:00Z'),
('avail_004', 'villa_003', '2024-06-14', TRUE, FALSE, '2024-06-03T09:10:00Z');

-- Villa Amenities Seed
INSERT INTO villa_amenities (villa_id, amenity_slug) VALUES
('villa_001', 'wifi'), ('villa_001', 'pool'), ('villa_001', 'parking'),
('villa_002', 'wifi'), ('villa_002', 'parking'), ('villa_002', 'kitchen'), ('villa_002', 'ac'),
('villa_003', 'wifi'), ('villa_003', 'ac'), ('villa_003', 'pet_friendly'), ('villa_003', 'parking');

-- Villa Saved (Favorites) Seed
INSERT INTO villa_saved (user_id, villa_id, saved_at) VALUES
('user_02', 'villa_001', '2024-06-05T08:00:00Z'),
('user_04', 'villa_002', '2024-06-05T09:00:00Z'),
('user_02', 'villa_003', '2024-06-06T09:00:00Z');

-- Bookings Seed
INSERT INTO bookings (
    booking_id, villa_id, guest_user_id, host_user_id, start_date, end_date, adults, children, infants, total_price, cleaning_fee, service_fee, status, payment_status, is_guest_id_provided, created_at, updated_at
) VALUES
('booking_001', 'villa_001', 'user_02', 'user_01', '2024-06-10', '2024-06-15', 2, 1, 0, 1800, 50, 25, 'confirmed', 'paid', TRUE, '2024-06-01T13:00:00Z', '2024-06-01T13:00:00Z'),
('booking_002', 'villa_002', 'user_04', 'user_03', '2024-07-01', '2024-07-05', 4, 0, 1, 1720, 60, 30, 'pending', 'pending', FALSE, '2024-06-02T16:00:00Z', '2024-06-02T16:00:00Z'),
('booking_003', 'villa_003', 'user_02', 'user_05', '2024-08-05', '2024-08-10', 2, 2, 0, 1600, 20, 15, 'cancelled', 'refunded', FALSE, '2024-06-03T10:00:00Z', '2024-06-03T10:00:00Z');

-- Reviews Seed
INSERT INTO reviews (
    review_id, booking_id, villa_id, reviewer_user_id, reviewee_user_id, reviewer_role, rating, text, is_deleted, created_at, updated_at, can_edit_until
) VALUES
('review_001', 'booking_001', 'villa_001', 'user_02', 'user_01', 'guest', 5, 'Amazing view, clean rooms!', FALSE, '2024-06-16T12:00:00Z', '2024-06-16T12:00:00Z', '2024-06-23T12:00:00Z'),
('review_002', 'booking_001', 'villa_001', 'user_01', 'user_02', 'host', 5, 'Great guest, welcome again anytime.', FALSE, '2024-06-16T13:00:00Z', '2024-06-16T13:00:00Z', '2024-06-23T13:00:00Z'),
('review_003', 'booking_002', 'villa_002', 'user_04', 'user_03', 'guest', 4.5, 'Perfect getaway, but a bit cold at night.', FALSE, '2024-07-06T12:00:00Z', '2024-07-06T12:00:00Z', '2024-07-13T12:00:00Z');

-- Message Threads Seed
INSERT INTO message_threads (
    thread_id, villa_id, booking_id, participant_user_ids, last_message_at, unread_counts, created_at, updated_at
) VALUES
('thread_001', 'villa_001', 'booking_001', '["user_01","user_02"]', '2024-06-10T15:00:00Z', '{"user_01":1,"user_02":0}', '2024-06-01T14:00:00Z', '2024-06-10T15:00:00Z'),
('thread_002', 'villa_002', 'booking_002', '["user_04","user_03"]', NULL, NULL, '2024-06-02T17:00:00Z', '2024-06-02T17:00:00Z');

-- Messages Seed
INSERT INTO messages (
    message_id, thread_id, sender_user_id, content, sent_at, is_read
) VALUES
('msg_001', 'thread_001', 'user_02', 'Hello, is the pool heated?', '2024-06-10T14:59:00Z', TRUE),
('msg_002', 'thread_001', 'user_01', 'Yes, it is heated all summer.', '2024-06-10T15:00:00Z', FALSE);

-- Notifications Seed
INSERT INTO notifications (
    notification_id, user_id, type, content, is_read, created_at
) VALUES
('notif_001', 'user_01', 'booking', 'You have a new booking request for Seaside Villa.', FALSE, '2024-06-02T10:00:00Z'),
('notif_002', 'user_02', 'message', 'Alice sent you a message about Seaside Villa.', TRUE, '2024-06-10T15:00:00Z');

-- Payout Methods Seed
INSERT INTO payout_methods (
    payout_method_id, host_user_id, method, details, is_active, created_at, updated_at
) VALUES
('pm_001', 'user_01', 'Paypal', '{"email":"alice.paypal@example.com"}', TRUE, '2024-06-01T10:05:00Z', '2024-06-01T10:05:00Z'),
('pm_002', 'user_03', 'Bank Transfer', '{"iban":"DE89370400440532013000"}', TRUE, '2024-06-01T15:00:00Z', '2024-06-01T15:00:00Z');

-- Payouts Seed
INSERT INTO payouts (
    payout_id, host_user_id, booking_id, amount, status, payout_method, details, payout_date, created_at
) VALUES
('payout_001', 'user_01', 'booking_001', 1725, 'sent', 'Paypal', '{"transaction_id":"123abc"}', '2024-06-17T12:00:00Z', '2024-06-17T12:00:00Z');

-- Admin Email Logs Seed
INSERT INTO admin_email_logs (
    log_id, user_id, to_email, type, subject, content, sent_at
) VALUES
('log_001', 'user_02', 'bob@example.com', 'welcome', 'Welcome to VillaShare', 'Dear Bob, welcome!', '2024-06-01T12:01:00Z'),
('log_002', NULL, 'support@company.com', 'support', 'General Inquiry', 'Support needed.', '2024-06-01T12:30:00Z');

-- Search Queries Seed
INSERT INTO search_queries (
    search_id, user_id, location, start_date, end_date, adults, children, infants, price_min, price_max, amenities, sort_by, map_bounds, page, view_mode, created_at
) VALUES
('search_001', 'user_02', 'Santorini', '2024-06-10', '2024-06-15', 2, 1, 0, 250, 400, 'wifi,pool', 'price_desc', NULL, 1, 'list', '2024-06-01T17:00:00Z'),
('search_002', NULL, 'Paris', '2024-08-05', '2024-08-10', 2, 2, 0, 200, 350, 'wifi,ac,pet_friendly', 'rating', '{bounds_json}', 1, 'map', '2024-06-03T17:00:00Z');

-- Legal Pages Seed
INSERT INTO legal_pages (page, title, content, updated_at) VALUES
('privacy', 'Privacy Policy', 'All your data is private.', '2024-06-01T00:00:00Z'),
('terms', 'Terms & Conditions', 'Read these terms carefully.', '2024-06-01T00:00:00Z');