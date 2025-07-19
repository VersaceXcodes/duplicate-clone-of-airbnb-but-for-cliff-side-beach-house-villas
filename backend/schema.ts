import { z } from 'zod';

/**
 * USERS TABLE
 */
// Main entity schema
export const userSchema = z.object({
  user_id: z.string(),
  email: z.string().email(),
  name: z.string(),
  password_hash: z.string(),
  role: z.string(),
  profile_photo_url: z.string().nullable(),
  contact_info: z.string().nullable(),
  host_bio: z.string().nullable(),
  is_email_confirmed: z.boolean(),
  email_confirmation_token: z.string().nullable(),
  password_reset_token: z.string().nullable(),
  has_unread_messages: z.boolean(),
  has_unread_notifications: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

// Input schema for creation
export const createUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password_hash: z.string().min(8),
  role: z.string().min(1).max(64),
  profile_photo_url: z.string().url().nullable().optional(),
  contact_info: z.string().max(255).nullable().optional(),
  host_bio: z.string().max(1000).nullable().optional(),
});

// Input schema for updates
export const updateUserInputSchema = z.object({
  user_id: z.string(),
  email: z.string().email().optional(),
  name: z.string().min(1).max(255).optional(),
  password_hash: z.string().min(8).optional(),
  role: z.string().max(64).optional(),
  profile_photo_url: z.string().url().nullable().optional(),
  contact_info: z.string().max(255).nullable().optional(),
  host_bio: z.string().max(1000).nullable().optional(),
  is_email_confirmed: z.boolean().optional(),
  email_confirmation_token: z.string().nullable().optional(),
  password_reset_token: z.string().nullable().optional(),
  has_unread_messages: z.boolean().optional(),
  has_unread_notifications: z.boolean().optional(),
});

// Query/search schema
export const searchUserInputSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['name', 'created_at', 'email']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  role: z.string().max(64).optional(),
  is_email_confirmed: z.boolean().optional(),
});

export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type SearchUserInput = z.infer<typeof searchUserInputSchema>;


/**
 * VILLAS TABLE
 */
export const villaSchema = z.object({
  villa_id: z.string(),
  host_user_id: z.string(),
  name: z.string(),
  subtitle: z.string().nullable(),
  location: z.string(),
  lat: z.number(),
  lng: z.number(),
  address: z.string().nullable(),
  description: z.string(),
  house_rules: z.string().nullable(),
  special_notes: z.string().nullable(),
  amenities: z.string(),
  price_per_night: z.number(),
  cleaning_fee: z.number(),
  service_fee: z.number(),
  minimum_stay_nights: z.number().int(),
  cancellation_policy: z.string(),
  status: z.string(),
  occupancy: z.number().int(),
  average_rating: z.number(),
  review_count: z.number().int(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const createVillaInputSchema = z.object({
  host_user_id: z.string(),
  name: z.string().min(1).max(255),
  subtitle: z.string().max(255).nullable().optional(),
  location: z.string().min(1).max(255),
  lat: z.number(),
  lng: z.number(),
  address: z.string().max(255).nullable().optional(),
  description: z.string().min(1),
  house_rules: z.string().max(2000).nullable().optional(),
  special_notes: z.string().max(2000).nullable().optional(),
  amenities: z.string().min(1),
  price_per_night: z.number().positive(),
  cleaning_fee: z.number().min(0).default(0).optional(),
  service_fee: z.number().min(0).default(0).optional(),
  minimum_stay_nights: z.number().int().min(1).default(1).optional(),
  cancellation_policy: z.string().min(1),
  status: z.string().min(1).default('published').optional(),
  occupancy: z.number().int().positive().default(1).optional(),
});

export const updateVillaInputSchema = z.object({
  villa_id: z.string(),
  host_user_id: z.string().optional(),
  name: z.string().min(1).max(255).optional(),
  subtitle: z.string().max(255).nullable().optional(),
  location: z.string().min(1).max(255).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  address: z.string().max(255).nullable().optional(),
  description: z.string().optional(),
  house_rules: z.string().max(2000).nullable().optional(),
  special_notes: z.string().max(2000).nullable().optional(),
  amenities: z.string().optional(),
  price_per_night: z.number().positive().optional(),
  cleaning_fee: z.number().min(0).optional(),
  service_fee: z.number().min(0).optional(),
  minimum_stay_nights: z.number().int().min(1).optional(),
  cancellation_policy: z.string().optional(),
  status: z.string().optional(),
  occupancy: z.number().int().positive().optional(),
  average_rating: z.number().optional(),
  review_count: z.number().int().optional(),
});

export const searchVillaInputSchema = z.object({
  query: z.string().optional(),
  location: z.string().optional(),
  min_lat: z.number().optional(),
  max_lat: z.number().optional(),
  min_lng: z.number().optional(),
  max_lng: z.number().optional(),
  amenities: z.string().optional(),
  price_min: z.number().min(0).optional(),
  price_max: z.number().min(0).optional(),
  occupancy: z.number().int().positive().optional(),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum([
    'created_at',
    'price_per_night',
    'average_rating',
    'review_count'
  ]).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  status: z.string().optional(),
});

export type Villa = z.infer<typeof villaSchema>;
export type CreateVillaInput = z.infer<typeof createVillaInputSchema>;
export type UpdateVillaInput = z.infer<typeof updateVillaInputSchema>;
export type SearchVillaInput = z.infer<typeof searchVillaInputSchema>;


/**
 * VILLA_PHOTOS TABLE
 */
export const villaPhotoSchema = z.object({
  photo_id: z.string(),
  villa_id: z.string(),
  url: z.string().url(),
  sort_order: z.number().int(),
  created_at: z.coerce.date(),
});

export const createVillaPhotoInputSchema = z.object({
  villa_id: z.string(),
  url: z.string().url(),
  sort_order: z.number().int(),
});

export const updateVillaPhotoInputSchema = z.object({
  photo_id: z.string(),
  villa_id: z.string().optional(),
  url: z.string().url().optional(),
  sort_order: z.number().int().optional(),
});

export const searchVillaPhotoInputSchema = z.object({
  villa_id: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['sort_order', 'created_at']).default('sort_order'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export type VillaPhoto = z.infer<typeof villaPhotoSchema>;
export type CreateVillaPhotoInput = z.infer<typeof createVillaPhotoInputSchema>;
export type UpdateVillaPhotoInput = z.infer<typeof updateVillaPhotoInputSchema>;
export type SearchVillaPhotoInput = z.infer<typeof searchVillaPhotoInputSchema>;


/**
 * VILLA_AVAILABILITY TABLE
 */
export const villaAvailabilitySchema = z.object({
  availability_id: z.string(),
  villa_id: z.string(),
  date: z.string(), // usually YYYY-MM-DD string
  is_available: z.boolean(),
  is_blocked: z.boolean(),
  created_at: z.coerce.date(),
});

export const createVillaAvailabilityInputSchema = z.object({
  villa_id: z.string(),
  date: z.string(),
  is_available: z.boolean(),
  is_blocked: z.boolean().default(false).optional(),
});

export const updateVillaAvailabilityInputSchema = z.object({
  availability_id: z.string(),
  villa_id: z.string().optional(),
  date: z.string().optional(),
  is_available: z.boolean().optional(),
  is_blocked: z.boolean().optional(),
});

export const searchVillaAvailabilityInputSchema = z.object({
  villa_id: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  is_available: z.boolean().optional(),
  is_blocked: z.boolean().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['date', 'created_at']).default('date'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export type VillaAvailability = z.infer<typeof villaAvailabilitySchema>;
export type CreateVillaAvailabilityInput = z.infer<typeof createVillaAvailabilityInputSchema>;
export type UpdateVillaAvailabilityInput = z.infer<typeof updateVillaAvailabilityInputSchema>;
export type SearchVillaAvailabilityInput = z.infer<typeof searchVillaAvailabilityInputSchema>;


/**
 * VILLA_AMENITIES TABLE (join)
 */
export const villaAmenitySchema = z.object({
  villa_id: z.string(),
  amenity_slug: z.string(),
});

export const createVillaAmenityInputSchema = z.object({
  villa_id: z.string(),
  amenity_slug: z.string(),
});

export const searchVillaAmenityInputSchema = z.object({
  villa_id: z.string().optional(),
  amenity_slug: z.string().optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
});

export type VillaAmenity = z.infer<typeof villaAmenitySchema>;
export type CreateVillaAmenityInput = z.infer<typeof createVillaAmenityInputSchema>;
export type SearchVillaAmenityInput = z.infer<typeof searchVillaAmenityInputSchema>;


/**
 * VILLA_SAVED TABLE (favorites)
 */
export const villaSavedSchema = z.object({
  user_id: z.string(),
  villa_id: z.string(),
  saved_at: z.coerce.date(),
});

export const createVillaSavedInputSchema = z.object({
  user_id: z.string(),
  villa_id: z.string(),
});

export const searchVillaSavedInputSchema = z.object({
  user_id: z.string().optional(),
  villa_id: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['saved_at']).default('saved_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type VillaSaved = z.infer<typeof villaSavedSchema>;
export type CreateVillaSavedInput = z.infer<typeof createVillaSavedInputSchema>;
export type SearchVillaSavedInput = z.infer<typeof searchVillaSavedInputSchema>;


/**
 * BOOKINGS TABLE
 */
export const bookingSchema = z.object({
  booking_id: z.string(),
  villa_id: z.string(),
  guest_user_id: z.string(),
  host_user_id: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  adults: z.number().int(),
  children: z.number().int(),
  infants: z.number().int(),
  total_price: z.number(),
  cleaning_fee: z.number(),
  service_fee: z.number(),
  status: z.string(),
  cancellation_reason: z.string().nullable(),
  payment_status: z.string(),
  is_guest_id_provided: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const createBookingInputSchema = z.object({
  villa_id: z.string(),
  guest_user_id: z.string(),
  host_user_id: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).default(0).optional(),
  infants: z.number().int().min(0).default(0).optional(),
  total_price: z.number().positive(),
  cleaning_fee: z.number().min(0),
  service_fee: z.number().min(0),
  status: z.string().default('pending').optional(),
  payment_status: z.string().default('pending').optional(),
  is_guest_id_provided: z.boolean().default(false).optional(),
  cancellation_reason: z.string().nullable().optional(),
});

export const updateBookingInputSchema = z.object({
  booking_id: z.string(),
  villa_id: z.string().optional(),
  guest_user_id: z.string().optional(),
  host_user_id: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  adults: z.number().int().min(1).optional(),
  children: z.number().int().min(0).optional(),
  infants: z.number().int().min(0).optional(),
  total_price: z.number().optional(),
  cleaning_fee: z.number().optional(),
  service_fee: z.number().optional(),
  status: z.string().optional(),
  cancellation_reason: z.string().nullable().optional(),
  payment_status: z.string().optional(),
  is_guest_id_provided: z.boolean().optional(),
});

export const searchBookingInputSchema = z.object({
  villa_id: z.string().optional(),
  guest_user_id: z.string().optional(),
  host_user_id: z.string().optional(),
  status: z.string().optional(),
  payment_status: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at', 'start_date', 'end_date']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type Booking = z.infer<typeof bookingSchema>;
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingInputSchema>;
export type SearchBookingInput = z.infer<typeof searchBookingInputSchema>;


/**
 * REVIEWS TABLE
 */
export const reviewSchema = z.object({
  review_id: z.string(),
  booking_id: z.string(),
  villa_id: z.string(),
  reviewer_user_id: z.string(),
  reviewee_user_id: z.string(),
  reviewer_role: z.string(),
  rating: z.number(),
  text: z.string().nullable(),
  is_deleted: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  can_edit_until: z.string().nullable(),
});

export const createReviewInputSchema = z.object({
  booking_id: z.string(),
  villa_id: z.string(),
  reviewer_user_id: z.string(),
  reviewee_user_id: z.string(),
  reviewer_role: z.string().min(1).max(32),
  rating: z.number().min(0).max(5),
  text: z.string().max(3000).nullable().optional(),
});

export const updateReviewInputSchema = z.object({
  review_id: z.string(),
  rating: z.number().min(0).max(5).optional(),
  text: z.string().max(3000).nullable().optional(),
  is_deleted: z.boolean().optional(),
  can_edit_until: z.string().nullable().optional(),
});

export const searchReviewInputSchema = z.object({
  villa_id: z.string().optional(),
  reviewer_user_id: z.string().optional(),
  reviewee_user_id: z.string().optional(),
  rating_min: z.number().min(0).max(5).optional(),
  rating_max: z.number().min(0).max(5).optional(),
  is_deleted: z.boolean().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at', 'rating']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type Review = z.infer<typeof reviewSchema>;
export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewInputSchema>;
export type SearchReviewInput = z.infer<typeof searchReviewInputSchema>;


/**
 * MESSAGE_THREADS TABLE
 */
export const messageThreadSchema = z.object({
  thread_id: z.string(),
  villa_id: z.string().nullable(),
  booking_id: z.string().nullable(),
  participant_user_ids: z.string(),
  last_message_at: z.string().nullable(),
  unread_counts: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const createMessageThreadInputSchema = z.object({
  villa_id: z.string().nullable().optional(),
  booking_id: z.string().nullable().optional(),
  participant_user_ids: z.string(),
});

export const updateMessageThreadInputSchema = z.object({
  thread_id: z.string(),
  villa_id: z.string().nullable().optional(),
  booking_id: z.string().nullable().optional(),
  participant_user_ids: z.string().optional(),
  last_message_at: z.string().nullable().optional(),
  unread_counts: z.string().nullable().optional(),
});

export const searchMessageThreadInputSchema = z.object({
  participant_user_id: z.string().optional(),
  villa_id: z.string().optional(),
  booking_id: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['updated_at', 'created_at']).default('updated_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type MessageThread = z.infer<typeof messageThreadSchema>;
export type CreateMessageThreadInput = z.infer<typeof createMessageThreadInputSchema>;
export type UpdateMessageThreadInput = z.infer<typeof updateMessageThreadInputSchema>;
export type SearchMessageThreadInput = z.infer<typeof searchMessageThreadInputSchema>;


/**
 * MESSAGES TABLE
 */
export const messageSchema = z.object({
  message_id: z.string(),
  thread_id: z.string(),
  sender_user_id: z.string(),
  content: z.string(),
  sent_at: z.coerce.date(),
  is_read: z.boolean(),
});

export const createMessageInputSchema = z.object({
  thread_id: z.string(),
  sender_user_id: z.string(),
  content: z.string().min(1).max(4000),
});

export const updateMessageInputSchema = z.object({
  message_id: z.string(),
  content: z.string().min(1).max(4000).optional(),
  is_read: z.boolean().optional(),
});

export const searchMessageInputSchema = z.object({
  thread_id: z.string().optional(),
  sender_user_id: z.string().optional(),
  is_read: z.boolean().optional(),
  sent_after: z.string().optional(),
  sent_before: z.string().optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['sent_at']).default('sent_at'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export type Message = z.infer<typeof messageSchema>;
export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageInputSchema>;
export type SearchMessageInput = z.infer<typeof searchMessageInputSchema>;


/**
 * NOTIFICATIONS TABLE
 */
export const notificationSchema = z.object({
  notification_id: z.string(),
  user_id: z.string(),
  type: z.string(),
  content: z.string(),
  is_read: z.boolean(),
  created_at: z.coerce.date(),
});

export const createNotificationInputSchema = z.object({
  user_id: z.string(),
  type: z.string().min(1).max(64),
  content: z.string().min(1).max(2000),
  is_read: z.boolean().default(false).optional(),
});

export const updateNotificationInputSchema = z.object({
  notification_id: z.string(),
  is_read: z.boolean().optional(),
});

export const searchNotificationInputSchema = z.object({
  user_id: z.string().optional(),
  type: z.string().optional(),
  is_read: z.boolean().optional(),
  limit: z.number().int().positive().default(25),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type Notification = z.infer<typeof notificationSchema>;
export type CreateNotificationInput = z.infer<typeof createNotificationInputSchema>;
export type UpdateNotificationInput = z.infer<typeof updateNotificationInputSchema>;
export type SearchNotificationInput = z.infer<typeof searchNotificationInputSchema>;


/**
 * PAYOUTS TABLE
 */
export const payoutSchema = z.object({
  payout_id: z.string(),
  host_user_id: z.string(),
  booking_id: z.string().nullable(),
  amount: z.number(),
  status: z.string(),
  payout_method: z.string(),
  details: z.string().nullable(),
  payout_date: z.string().nullable(),
  created_at: z.coerce.date(),
});

export const createPayoutInputSchema = z.object({
  host_user_id: z.string(),
  booking_id: z.string().nullable().optional(),
  amount: z.number().positive(),
  status: z.string().min(1).max(32),
  payout_method: z.string().min(1).max(32),
  details: z.string().nullable().optional(),
  payout_date: z.string().nullable().optional(),
});

export const updatePayoutInputSchema = z.object({
  payout_id: z.string(),
  status: z.string().min(1).max(32).optional(),
  payout_method: z.string().min(1).max(32).optional(),
  details: z.string().nullable().optional(),
  payout_date: z.string().nullable().optional(),
});

export const searchPayoutInputSchema = z.object({
  host_user_id: z.string().optional(),
  booking_id: z.string().optional(),
  status: z.string().optional(),
  payout_method: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at', 'payout_date']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type Payout = z.infer<typeof payoutSchema>;
export type CreatePayoutInput = z.infer<typeof createPayoutInputSchema>;
export type UpdatePayoutInput = z.infer<typeof updatePayoutInputSchema>;
export type SearchPayoutInput = z.infer<typeof searchPayoutInputSchema>;


/**
 * PAYOUT_METHODS TABLE
 */
export const payoutMethodSchema = z.object({
  payout_method_id: z.string(),
  host_user_id: z.string(),
  method: z.string(),
  details: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const createPayoutMethodInputSchema = z.object({
  host_user_id: z.string(),
  method: z.string().min(1).max(32),
  details: z.string().nullable().optional(),
  is_active: z.boolean().default(true).optional(),
});

export const updatePayoutMethodInputSchema = z.object({
  payout_method_id: z.string(),
  method: z.string().min(1).max(32).optional(),
  details: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

export const searchPayoutMethodInputSchema = z.object({
  host_user_id: z.string().optional(),
  is_active: z.boolean().optional(),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().nonnegative().default(0),
});

export type PayoutMethod = z.infer<typeof payoutMethodSchema>;
export type CreatePayoutMethodInput = z.infer<typeof createPayoutMethodInputSchema>;
export type UpdatePayoutMethodInput = z.infer<typeof updatePayoutMethodInputSchema>;
export type SearchPayoutMethodInput = z.infer<typeof searchPayoutMethodInputSchema>;


/**
 * ADMIN_EMAIL_LOGS TABLE
 */
export const adminEmailLogSchema = z.object({
  log_id: z.string(),
  user_id: z.string().nullable(),
  to_email: z.string().email(),
  type: z.string(),
  subject: z.string(),
  content: z.string(),
  sent_at: z.coerce.date(),
});

export const createAdminEmailLogInputSchema = z.object({
  user_id: z.string().nullable().optional(),
  to_email: z.string().email(),
  type: z.string().max(64),
  subject: z.string().max(255),
  content: z.string(),
  sent_at: z.string().optional(),
});

export const searchAdminEmailLogInputSchema = z.object({
  user_id: z.string().optional(),
  to_email: z.string().optional(),
  type: z.string().optional(),
  subject: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['sent_at', 'log_id']).default('sent_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type AdminEmailLog = z.infer<typeof adminEmailLogSchema>;
export type CreateAdminEmailLogInput = z.infer<typeof createAdminEmailLogInputSchema>;
export type SearchAdminEmailLogInput = z.infer<typeof searchAdminEmailLogInputSchema>;


/**
 * AMENITIES TABLE
 */
export const amenitySchema = z.object({
  slug: z.string(),
  label: z.string(),
  icon_url: z.string().nullable(),
});

export const createAmenityInputSchema = z.object({
  slug: z.string().min(1).max(64),
  label: z.string().min(1).max(255),
  icon_url: z.string().url().nullable().optional(),
});

export const updateAmenityInputSchema = z.object({
  slug: z.string(),
  label: z.string().min(1).max(255).optional(),
  icon_url: z.string().url().nullable().optional(),
});

export const searchAmenityInputSchema = z.object({
  slug: z.string().optional(),
  label: z.string().optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
});

export type Amenity = z.infer<typeof amenitySchema>;
export type CreateAmenityInput = z.infer<typeof createAmenityInputSchema>;
export type UpdateAmenityInput = z.infer<typeof updateAmenityInputSchema>;
export type SearchAmenityInput = z.infer<typeof searchAmenityInputSchema>;


/**
 * SEARCH_QUERIES TABLE
 */
export const searchQuerySchema = z.object({
  search_id: z.string(),
  user_id: z.string().nullable(),
  location: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  adults: z.number().int().nullable(),
  children: z.number().int().nullable(),
  infants: z.number().int().nullable(),
  price_min: z.number().nullable(),
  price_max: z.number().nullable(),
  amenities: z.string().nullable(),
  sort_by: z.string().nullable(),
  map_bounds: z.string().nullable(),
  page: z.number().int().nullable(),
  view_mode: z.string().nullable(),
  created_at: z.coerce.date(),
});

export const createSearchQueryInputSchema = z.object({
  user_id: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  adults: z.number().int().min(1).nullable().optional(),
  children: z.number().int().min(0).nullable().optional(),
  infants: z.number().int().min(0).nullable().optional(),
  price_min: z.number().min(0).nullable().optional(),
  price_max: z.number().min(0).nullable().optional(),
  amenities: z.string().nullable().optional(),
  sort_by: z.string().nullable().optional(),
  map_bounds: z.string().nullable().optional(),
  page: z.number().int().min(1).nullable().optional(),
  view_mode: z.string().nullable().optional(),
});

export const searchSearchQueryInputSchema = z.object({
  user_id: z.string().optional(),
  location: z.string().optional(),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['created_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type CreateSearchQueryInput = z.infer<typeof createSearchQueryInputSchema>;
export type SearchSearchQueryInput = z.infer<typeof searchSearchQueryInputSchema>;


/**
 * LEGAL_PAGES TABLE
 */
export const legalPageSchema = z.object({
  page: z.string(),
  title: z.string(),
  content: z.string(),
  updated_at: z.coerce.date(),
});

export const createLegalPageInputSchema = z.object({
  page: z.string().min(1).max(128),
  title: z.string().min(1).max(255),
  content: z.string(),
});

export const updateLegalPageInputSchema = z.object({
  page: z.string(),
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
});

export const searchLegalPageInputSchema = z.object({
  page: z.string().optional(),
  limit: z.number().int().positive().default(10),
  offset: z.number().int().nonnegative().default(0),
  sort_by: z.enum(['updated_at']).default('updated_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type LegalPage = z.infer<typeof legalPageSchema>;
export type CreateLegalPageInput = z.infer<typeof createLegalPageInputSchema>;
export type UpdateLegalPageInput = z.infer<typeof updateLegalPageInputSchema>;
export type SearchLegalPageInput = z.infer<typeof searchLegalPageInputSchema>;