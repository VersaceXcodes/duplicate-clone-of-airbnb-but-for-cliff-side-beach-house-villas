import React, { useMemo, useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import axios, { AxiosError } from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/main";

// --- Types from Zod schemas
import type {
  User,
  Villa,
  VillaPhoto,
  VillaAvailability,
  Amenity,
  Review,
} from "@schema";

// --- Helpers ---
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
const formatCurrency = (value: number, currency = "USD") =>
  value
    ? value.toLocaleString(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      })
    : "$0";

const formatDate = (d: string | Date) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const dateAddDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const parseDateInput = (s: string) => {
  // Accepts YYYY-MM-DD only
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const calculateNights = (start: string | null, end: string | null): number => {
  if (!start || !end) return 0;
  const d1 = parseDateInput(start);
  const d2 = parseDateInput(end);
  if (!d1 || !d2) return 0;
  const diffMs = d2.getTime() - d1.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
};

// --- Availability Calendar Utilities ---
type DateCell = {
  date: string;
  is_available: boolean;
  is_blocked: boolean;
};

const getBlockedDatesSet = (availability: VillaAvailability[]): Set<string> =>
  new Set(
    availability
      .filter(a => !a.is_available || a.is_blocked)
      .map(a => a.date)
  );

const getAvailableDatesSet = (availability: VillaAvailability[]): Set<string> =>
  new Set(
    availability
      .filter(a => a.is_available && !a.is_blocked)
      .map(a => a.date)
  );

const withinRange = (date: Date, from: Date, to: Date) =>
  date >= from && date <= to;

const todayISO = () => {
  const t = new Date();
  return t.toISOString().slice(0, 10);
};

// --- Main Component ---
const UV_ListingDetails: React.FC = () => {
  // Routing param
  const { villa_id: param_villa_id } = useParams<{ villa_id: string }>();
  const navigate = useNavigate();

  // ---- Global State (Zustand, individual selectors ONLY!) ----
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const saved_villa_ids = useAppStore((s) => s.saved_villa_ids);
  const add_saved_villa_id = useAppStore((s) => s.add_saved_villa_id);
  const remove_saved_villa_id = useAppStore((s) => s.remove_saved_villa_id);
  const set_error_state = useAppStore((s) => s.set_error_state);

  // --- Local State for Booking Form ---
  const [booking_widget, setBookingWidget] = useState<{
    start_date: string | null;
    end_date: string | null;
    adults: number;
    children: number;
    infants: number;
  }>({
    start_date: null,
    end_date: null,
    adults: 1,
    children: 0,
    infants: 0,
  });
  const [bookingTouched, setBookingTouched] = useState(false);

  // --- Heart Save Icon State ---
  const [localFavorite, setLocalFavorite] = useState<boolean>(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // --- Photo Gallery Index
  const [photoIndex, setPhotoIndex] = useState(0);

  // --- Focus Trap for modal (Contact Host)
  const messageHostModalRef = useRef<HTMLDivElement>(null);
  const [showMessageHost, setShowMessageHost] = useState(false);

  // ---- GET villa_id and sanitize ----
  const villa_id = typeof param_villa_id === "string" ? param_villa_id.replace(/[^a-zA-Z0-9_\-]/g, "") : "";

  // --- React Query Hooks ---

  // 1. Fetch villa detail
  const {
    data: villa_detail,
    isLoading: villaLoading,
    isError: villaError,
    error: villaErrorObj,
  } = useQuery<Villa, AxiosError>({
    queryKey: ["villa_detail", villa_id],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/villas/${villa_id}`);
      return data;
    },
    enabled: !!villa_id,
    retry: false,
  });

  // 2. Fetch villa photos
  const {
    data: photos = [],
    isLoading: photosLoading,
    isError: photosError,
  } = useQuery<VillaPhoto[], AxiosError>({
    queryKey: ["villa_photos", villa_id],
    queryFn: async () => {
      const { data } = await axios.get(
        `${API_BASE}/villas/${villa_id}/photos`,
        { params: { limit: 20, sort_by: "sort_order" } }
      );
      return data;
    },
    enabled: !!villa_id,
    retry: false,
  });

  // 3. Fetch availability
  const {
    data: availability = [],
    isLoading: availLoading,
    isError: availError,
  } = useQuery<VillaAvailability[], AxiosError>({
    queryKey: ["villa_availability", villa_id],
    queryFn: async () => {
      const { data } = await axios.get(
        `${API_BASE}/villas/${villa_id}/availability`
      );
      return data;
    },
    enabled: !!villa_id,
    retry: false,
  });

  // 4. Fetch reviews
  const {
    data: reviews = [],
    isLoading: reviewsLoading,
    isError: reviewsError,
  } = useQuery<Review[], AxiosError>({
    queryKey: ["villa_reviews", villa_id],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE}/reviews`, {
        params: {
          villa_id,
          is_deleted: false,
          limit: 20,
        },
      });
      return data;
    },
    enabled: !!villa_id,
    retry: false,
  });

  // 5. Fetch is_favorited (only if logged in)
  const {
    data: fetchFavoriteData,
    isLoading: favLoading,
    refetch: refetchFavorite,
  } = useQuery<boolean>({
    queryKey: ["villa_is_favorited", villa_id, user?.user_id],
    queryFn: async () => {
      if (!user?.user_id || !auth_token) return false;
      const { data } = await axios.get(`${API_BASE}/villa-saved`, {
        params: { user_id: user.user_id, villa_id, limit: 1 },
        headers: { Authorization: `Bearer ${auth_token}` },
      });
      return Array.isArray(data) && data.length > 0;
    },
    enabled: !!user?.user_id && !!auth_token && !!villa_id,
    retry: false,
  });

  // 6. Host profile (dependent on villa_detail)
  const {
    data: host_profile,
    isLoading: hostLoading,
    isError: hostError,
  } = useQuery<Pick<User, "user_id" | "name" | "profile_photo_url" | "host_bio">, AxiosError>({
    queryKey: ["host_profile", villa_detail?.host_user_id],
    queryFn: async () => {
      if (!villa_detail?.host_user_id) throw new Error("Missing host user id");
      const { data } = await axios.get<User>(
        `${API_BASE}/users/${villa_detail.host_user_id}`
      );
      return {
        user_id: data.user_id,
        name: data.name,
        profile_photo_url: data.profile_photo_url,
        host_bio: data.host_bio,
      };
    },
    enabled: !!villa_detail?.host_user_id,
    retry: false,
  });

  // 7. Amenities (join + lookup)
  const {
    data: amenities = [],
    isLoading: amenitiesLoading,
    isError: amenitiesError,
  } = useQuery<Amenity[], AxiosError>({
    queryKey: ["villa_amenities", villa_id],
    queryFn: async () => {
      // 1: get /villa-amenities to get amenity_slug[]
      const { data: joins } = await axios.get<{ villa_id: string; amenity_slug: string }[]>(
        `${API_BASE}/villa-amenities`,
        {
          params: { villa_id, limit: 50 },
        }
      );
      if (joins.length === 0) return [];
      // 2: get /amenities?slug=slug1,slug2,...
      const slugList = joins.map((a) => a.amenity_slug).join(",");
      const { data: amenities } = await axios.get<Amenity[]>(
        `${API_BASE}/amenities`,
        { params: { slug: slugList, limit: 50 } }
      );
      return amenities;
    },
    enabled: !!villa_id,
    retry: false,
  });

  // --------- Local favorite state from global/store + react-query ----------
  useEffect(() => {
    setLocalFavorite(
      !!(
        (fetchFavoriteData !== undefined ? fetchFavoriteData : undefined) ??
        saved_villa_ids.includes(villa_id)
      )
    );
    // eslint-disable-next-line
  }, [fetchFavoriteData, saved_villa_ids, villa_id]);

  // --- Heart/Save mutations ---
  const queryClient = useQueryClient();

  const favoriteMutation = useMutation<boolean, AxiosError, { add: boolean }>({
    mutationFn: async ({ add }) => {
      setSaveLoading(true);
      if (!user?.user_id || !auth_token) throw new Error("Not authorized");
      if (add) {
        await axios.post(
          `${API_BASE}/villa-saved`,
          { user_id: user.user_id, villa_id },
          { headers: { Authorization: `Bearer ${auth_token}` } }
        );
        add_saved_villa_id(villa_id);
        return true;
      } else {
        await axios.delete(
          `${API_BASE}/villa-saved`,
          {
            headers: { Authorization: `Bearer ${auth_token}` },
            data: { user_id: user.user_id, villa_id },
          }
        );
        remove_saved_villa_id(villa_id);
        return false;
      }
    },
    onMutate: (v) => {
      setLocalFavorite(v.add);
    },
    onSuccess: (isFav) => {
      setLocalFavorite(isFav);
      refetchFavorite();
      setSaveLoading(false);
    },
    onError: (error) => {
      setSaveLoading(false);
      set_error_state({
        has_error: true,
        context: "villa_save",
        message: error?.response?.data?.error || error.message,
      });
      setLocalFavorite(!localFavorite);
    },
  });

  // ------- Price Calculation -------
  const nights = useMemo(
    () => calculateNights(booking_widget.start_date, booking_widget.end_date),
    [booking_widget.start_date, booking_widget.end_date]
  );

  const price_breakdown = useMemo(() => {
    if (!villa_detail) {
      return {
        nights: 0,
        price_per_night: 0,
        cleaning_fee: 0,
        service_fee: 0,
        total: 0,
      };
    }
    const base = villa_detail.price_per_night;
    const cleaning = villa_detail.cleaning_fee ?? 0;
    const service = villa_detail.service_fee ?? 0;
    const subtotal = base * nights;
    const total = subtotal + cleaning + service;
    return {
      nights,
      price_per_night: base,
      cleaning_fee: cleaning,
      service_fee: service,
      total,
    };
  }, [villa_detail, nights]);

  // ---- Collect blocked/booked dates for UI (ISO: YYYY-MM-DD) ---
  const blockedDates = useMemo(() => getBlockedDatesSet(availability), [availability]);
  const availableDates = useMemo(() => getAvailableDatesSet(availability), [availability]);

  // ---- Booking widget input validation ----
  const canBook =
    user?.user_id &&
    user.is_email_confirmed &&
    villa_detail &&
    booking_widget.start_date &&
    booking_widget.end_date &&
    nights > 0 &&
    price_breakdown.total > 0 &&
    // check for start/end not blocked
    !blockedDates.has(booking_widget.start_date) &&
    !blockedDates.has(booking_widget.end_date);

  // --- Handlers ---
  const handleSaveClick = () => {
    if (!user?.user_id || !user.is_email_confirmed) {
      navigate("/auth?mode=login");
      return;
    }
    favoriteMutation.mutate({ add: !localFavorite });
  };

  const handleBookingChange = (field: string, value: any) => {
    setBookingTouched(true);
    setBookingWidget((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePhotoNav = (inc: number) => {
    if (photos.length <= 1) return;
    setPhotoIndex((idx) => clamp(idx + inc, 0, photos.length - 1));
  };

  // --- Focus modal on open/contact host ---
  useEffect(() => {
    if (showMessageHost && messageHostModalRef.current) {
      messageHostModalRef.current.focus();
    }
  }, [showMessageHost]);

  // --- Scroll to top on villa change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [villa_id]);

  // --- Error handling fallback UI
  if (villaLoading || photosLoading || availLoading || amenitiesLoading || hostLoading || reviewsLoading) {
    return (
      <div className="flex flex-col w-full items-center justify-center min-h-[30vh] py-14">
        <span className="animate-spin rounded-full w-8 h-8 border-2 border-t-primary border-gray-200"></span>
        <span className="mt-3 text-gray-700">Loading Villa...</span>
      </div>
    );
  }
  if (villaError || !villa_detail) {
    return (
      <div className="flex flex-col w-full items-center justify-center min-h-[30vh] py-14 text-center">
        <span className="font-semibold text-red-600 text-xl">Villa Not Found</span>
        <Link className="mt-4 px-4 py-2 rounded bg-primary text-white" to="/search">
          Back to Villas
        </Link>
      </div>
    );
  }

  // --------- Calendar UI: months shown for simple visual -----------
  const today = todayISO();
  const calendarMonths = 2;
  const calendarStart = useMemo(() => {
    // First day of next month ahead of today
    const t = parseDateInput(today);
    t.setDate(1);
    return t;
  }, [today]);
  const calendarGrid: {
    month: number;
    year: number;
    days: Array<{
      date: string;
      blocked: boolean;
      available: boolean;
      selected: boolean;
      isToday: boolean;
    }>;
  }[] = useMemo(() => {
    const blocks = blockedDates;
    const avails = availableDates;
    const res: any[] = [];
    let dt = new Date(calendarStart.getTime());
    for (let m = 0; m < calendarMonths; m++) {
      const month = dt.getMonth();
      const year = dt.getFullYear();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const days = [];
      for (let i = 1; i <= last.getDate(); i++) {
        const d = new Date(year, month, i);
        const iso = d.toISOString().slice(0, 10);
        days.push({
          date: iso,
          blocked: blocks.has(iso),
          available: avails.has(iso),
          selected:
            booking_widget.start_date === iso || booking_widget.end_date === iso,
          isToday: iso === today,
        });
      }
      res.push({ month, year, days });
      dt = new Date(dt.getFullYear(), dt.getMonth() + 1, 1);
    }
    return res;
  }, [calendarStart, calendarMonths, today, blockedDates, availableDates, booking_widget.start_date, booking_widget.end_date]);

  // Reviews: aggregate score
  const avgRating = useMemo(
    () => reviews.length
      ? (reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length)
      : villa_detail.average_rating || null,
    [reviews, villa_detail]
  );

  // --- Render! ---
  return (
    <>
      {/* PHOTOS GALLERY */}
      <div className="w-full max-w-7xl mx-auto px-2 xl:px-0 pt-4 flex flex-col gap-4">
        {photos.length > 0 ? (
          <div className="relative aspect-[3/1] w-full rounded-lg overflow-hidden bg-gray-100 shadow">
            <img
              src={photos[photoIndex]?.url}
              alt={`Villa Photo ${photoIndex + 1}`}
              className="object-cover w-full h-full select-none"
              style={{ aspectRatio: "3/1" }}
              draggable={false}
            />
            {photos.length > 1 && (
              <>
                <button
                  aria-label="Previous Photo"
                  className="absolute left-2 top-1/2 -translate-y-1/2 shadow bg-white/70 hover:bg-white rounded-full p-2"
                  onClick={() => handlePhotoNav(-1)}
                  tabIndex={0}
                  disabled={photoIndex === 0}
                  type="button"
                >
                  <span className="sr-only">Prev</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M18 12H6m0 0l6-6m-6 6l6 6" /></svg>
                </button>
                <button
                  aria-label="Next Photo"
                  className="absolute right-2 top-1/2 -translate-y-1/2 shadow bg-white/70 hover:bg-white rounded-full p-2"
                  onClick={() => handlePhotoNav(1)}
                  tabIndex={0}
                  disabled={photoIndex === photos.length - 1}
                  type="button"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 12h12m0 0l-6 6m6-6l-6-6" /></svg>
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                  {photos.map((_, idx) => (
                    <button
                      key={idx}
                      aria-label={`Go to photo ${idx + 1}`}
                      className={`w-3 h-3 rounded-full ${idx === photoIndex ? "bg-primary" : "bg-white/80 border border-gray-300"} hover:bg-primary transition`}
                      onClick={() => setPhotoIndex(idx)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="w-full aspect-[3/1] rounded-lg bg-gray-200 animate-pulse" />
        )}
        {/* TITLE + SUMMARY */}
        <div className="flex flex-col lg:flex-row justify-between items-baseline mt-2 gap-2">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold flex flex-row items-center gap-2">
              {villa_detail.name}
              <span className="ml-2 px-2 py-1 text-xs bg-teal-600 text-white rounded font-bold">Cliff-side Verified</span>
              <button
                aria-label={localFavorite ? "Unsave from favorites" : "Save to favorites"}
                title={localFavorite ? "Unsave this villa" : "Save to favorites"}
                className={`ml-4 transition ${localFavorite ? "text-red-500" : "text-gray-400"} hover:text-red-600 active:scale-90`}
                onClick={handleSaveClick}
                disabled={saveLoading}
                tabIndex={0}
                type="button"
              >
                {localFavorite ? (
                  <svg aria-hidden="true" fill="currentColor" className="w-7 h-7" viewBox="0 0 20 20"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 18.657l-6.828-6.829a4 4 0 010-5.656z" /></svg>
                ) : (
                  <svg aria-hidden="true" fill="none" stroke="currentColor" className="w-7 h-7" viewBox="0 0 24 24"><path d="M16.29 5.71a5 5 0 00-7.07 0l-1.51 1.51a5 5 0 000 7.07l7.07 7.07a1 1 0 001.42 0l7.07-7.07a5 5 0 000-7.07l-1.51-1.51a5 5 0 00-7.07 0z" strokeWidth={2} /></svg>
                )}
              </button>
            </h1>
            {villa_detail.subtitle && (
              <p className="text-gray-700 text-base mt-1">{villa_detail.subtitle}</p>
            )}
            <div className="flex flex-row items-center mt-2 gap-2 flex-wrap text-gray-600 text-sm">
              <span>{villa_detail.location}</span>
              <span>•</span>
              <span>{villa_detail.occupancy} guests</span>
              <span>•</span>
              <span>{villa_detail.minimum_stay_nights} night min stay</span>
              <span>•</span>
              {amenities.length > 0 && (
                <span>
                  {amenities.slice(0, 3).map((a, idx) => (
                    <span key={a.slug} className="inline-flex items-center gap-1">
                      {a.icon_url && <img src={a.icon_url} alt={a.label} className="h-5 w-5 inline mr-0.5" />}
                      <span>{a.label}</span>
                      {idx < Math.min(amenities.length, 3) - 1 && ", "}
                    </span>
                  ))}
                  {amenities.length > 3 && <span>+{amenities.length - 3} more</span>}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-row items-center gap-3 shrink-0 mt-2 order-3 md:order-2">
            <span className="text-xl font-bold text-primary">{formatCurrency(villa_detail.price_per_night)}/night</span>
            <span className="text-sm font-medium text-gray-700"><span className="sr-only">Average rating</span>⭐ {villa_detail.average_rating ? Number(villa_detail.average_rating).toFixed(2) : "–"}</span>
            <span className="text-xs text-gray-500">({villa_detail.review_count} reviews)</span>
          </div>
        </div>
        {/* HOST */}
        <div className="flex flex-row items-center gap-3 mt-3 bg-gray-50 rounded px-4 py-2 shadow-sm w-max max-w-md">
          {host_profile?.profile_photo_url ? (
            <img src={host_profile.profile_photo_url} alt={host_profile.name} className="h-11 w-11 rounded-full border object-cover" />
          ) : (
            <div className="h-11 w-11 rounded-full bg-gray-300 flex items-center justify-center text-xl">{host_profile?.name?.[0] || "?"}</div>
          )}
          <div>
            <div className="font-semibold text-gray-800">Hosted by {host_profile?.name}</div>
            <div className="text-sm text-gray-600 max-w-xs truncate">{host_profile?.host_bio || <span className="italic text-gray-500">No host bio</span>}</div>
            <button
              className="mt-2 px-3 py-1 rounded bg-primary hover:bg-primary/90 text-white text-xs font-medium"
              onClick={() => setShowMessageHost(true)}
              tabIndex={0}
              aria-label="Contact host"
              type="button"
              disabled={!user?.user_id || !user.is_email_confirmed}
            >Contact Host</button>
            {!user?.is_email_confirmed && user?.user_id && (
              <div className="text-xs text-yellow-600 mt-1" aria-live="polite">
                Confirm your email to contact host.
              </div>
            )}
          </div>
        </div>
        {/* MAP EMBED */}
        <div className="mt-5 rounded-lg overflow-hidden w-full h-72 shadow relative">
          <iframe
            title="Villa Location Map"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${villa_detail.lng-0.01}%2C${villa_detail.lat-0.01}%2C${villa_detail.lng+0.01}%2C${villa_detail.lat+0.01}&layer=mapnik&marker=${villa_detail.lat}%2C${villa_detail.lng}`}
            style={{ width: "100%", height: "100%", border: 0 }}
            className="w-full h-full"
            loading="lazy"
            aria-label="Map of villa location"
          />
          <a
            href={`https://www.openstreetmap.org/?mlat=${villa_detail.lat}&mlon=${villa_detail.lng}#map=14/${villa_detail.lat}/${villa_detail.lng}`}
            className="absolute bottom-2 right-2 bg-white rounded px-2 py-1 text-xs text-primary shadow hover:underline"
            target="_blank" rel="noopener noreferrer"
          >
            View on map
          </a>
        </div>
        {/* DESCRIPTION, HOUSE RULES, NOTES */}
        <div className="mt-5 max-w-2xl">
          <h2 className="text-lg font-semibold mb-1">About this villa</h2>
          <div className="text-gray-800 whitespace-pre-line">{villa_detail.description}</div>
          {villa_detail.special_notes && (
            <div className="mt-2 p-2 bg-yellow-100/80 rounded">
              <div className="font-bold text-yellow-700 mb-1">Special Notes</div>
              <div className="text-gray-700">{villa_detail.special_notes}</div>
            </div>
          )}
          {villa_detail.house_rules && (
            <div className="mt-2 p-2 bg-gray-100/90 rounded">
              <div className="font-bold text-teal-700 mb-1">House Rules</div>
              <div className="text-gray-700 whitespace-pre-line">{villa_detail.house_rules}</div>
            </div>
          )}
        </div>
        {/* AMENITIES */}
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Amenities</h2>
          {amenities.length === 0 ? (
            <div className="text-gray-500">No amenities info for this villa.</div>
          ) : (
            <ul className="flex flex-wrap gap-4">
              {amenities.map((a) => (
                <li key={a.slug} className="flex items-center gap-2 px-3 py-2 rounded border">
                  {a.icon_url ? (
                    <img src={a.icon_url} alt={a.label} className="h-6 w-6" />
                  ) : (
                    <span className="h-6 w-6 rounded bg-gray-200 text-xs grid place-items-center text-gray-400">
                      {a.label[0]}
                    </span>
                  )}
                  <span>{a.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* AVAILABILITY CALENDAR + BOOKING WIDGET */}
        <div className="mt-6 flex flex-col md:flex-row gap-5 lg:gap-10 items-start">
          {/* AVAILABILITY CALENDAR */}
          <div className="w-full md:w-2/3">
            <h2 className="text-lg font-semibold mb-2">Availability</h2>
            <div className="flex gap-8 flex-wrap">
              {calendarGrid.map(({ month, year, days }, idx) => (
                <div key={idx} className="w-56">
                  <div className="text-center font-semibold mb-1">
                    {new Date(year, month).toLocaleString(undefined, { month: "long", year: "numeric" })}
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-xs">
                    {/* Weekdays */}
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                      <div key={d} className="text-gray-500 text-center">{d}</div>
                    ))}
                    {/* Empty boxes before 1st */}
                    {(() => {
                      const firstDay = new Date(year, month, 1).getDay();
                      return Array.from({ length: firstDay }, (_, i) => (
                        <div key={"empty" + i}></div>
                      ));
                    })()}
                    {/* Days */}
                    {days.map((day) => (
                      <button
                        key={day.date}
                        type="button"
                        aria-label={day.date + (day.blocked ? " (Unavailable)" : "")}
                        className={
                          "rounded h-7 w-7 flex items-center justify-center " +
                          (day.blocked
                            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                            : day.selected
                            ? "bg-primary text-white font-bold"
                            : day.available
                            ? "bg-green-50 text-green-900 hover:bg-green-100"
                            : "bg-white")
                        }
                        disabled={day.blocked}
                        tabIndex={0}
                        onClick={() => {
                          if (!booking_widget.start_date || booking_widget.end_date) {
                            setBookingWidget((b) => ({
                              ...b,
                              start_date: day.date,
                              end_date: null,
                            }));
                          } else if (booking_widget.start_date && !booking_widget.end_date) {
                            // Ensure end >= start
                            if (day.date < booking_widget.start_date) {
                              setBookingWidget((b) => ({
                                ...b,
                                start_date: day.date,
                                end_date: b.start_date,
                              }));
                            } else {
                              setBookingWidget((b) => ({
                                ...b,
                                end_date: day.date,
                              }));
                            }
                          }
                        }}
                      >
                        {new Date(day.date).getDate()}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-500 flex gap-3">
              <span><span className="inline-block w-4 h-4 bg-green-100 mr-1" /> Available</span>
              <span><span className="inline-block w-4 h-4 bg-gray-200 mr-1" /> Blocked/Unavailable</span>
              <span><span className="inline-block w-4 h-4 bg-primary mr-1" /> Selected</span>
            </div>
          </div>
          {/* BOOKING SIDEBAR */}
          <div className="w-full md:w-1/3">
            <div className="sticky top-24 bg-white rounded-lg shadow-lg px-6 py-6 border">
              <div className="mb-2 flex flex-col gap-1">
                <div className="text-lg font-semibold">Book this villa</div>
                <div className="text-xs text-gray-500">Secure your dates. No payment yet.</div>
              </div>
              <form
                className="flex flex-col gap-3"
                autoComplete="off"
                aria-label="Booking form">
                <div className="flex flex-row gap-2 items-center">
                  <label htmlFor="date_start" className="w-20 font-medium text-sm">Check-in</label>
                  <input
                    id="date_start"
                    name="date_start"
                    type="date"
                    className="border px-2 py-1 rounded"
                    value={booking_widget.start_date ?? ""}
                    min={today}
                    onChange={(e) => handleBookingChange("start_date", e.target.value)}
                    aria-invalid={!!bookingTouched && !booking_widget.start_date}
                  />
                </div>
                <div className="flex flex-row gap-2 items-center">
                  <label htmlFor="date_end" className="w-20 font-medium text-sm">Check-out</label>
                  <input
                    id="date_end"
                    name="date_end"
                    type="date"
                    className="border px-2 py-1 rounded"
                    value={booking_widget.end_date ?? ""}
                    min={booking_widget.start_date ? booking_widget.start_date : today}
                    onChange={(e) => handleBookingChange("end_date", e.target.value)}
                    aria-invalid={!!bookingTouched && !booking_widget.end_date}
                  />
                </div>
                <div className="flex gap-2">
                  <label htmlFor="adults" className="w-20 font-medium text-sm pt-2">Adults</label>
                  <input
                    id="adults"
                    name="adults"
                    type="number"
                    min={1}
                    max={villa_detail.occupancy}
                    className="w-16 border px-2 py-1 rounded"
                    value={booking_widget.adults}
                    onChange={(e) =>
                      handleBookingChange(
                        "adults",
                        clamp(Number(e.target.value), 1, villa_detail.occupancy)
                      )
                    }
                  />
                  <label htmlFor="children" className="font-medium text-sm pt-2">Children</label>
                  <input
                    id="children"
                    name="children"
                    type="number"
                    min={0}
                    max={villa_detail.occupancy - booking_widget.adults}
                    className="w-14 border px-2 py-1 rounded"
                    value={booking_widget.children}
                    onChange={(e) =>
                      handleBookingChange("children", clamp(Number(e.target.value), 0, villa_detail.occupancy - booking_widget.adults))
                    }
                  />
                  <label htmlFor="infants" className="font-medium text-sm pt-2">Infants</label>
                  <input
                    id="infants"
                    name="infants"
                    type="number"
                    min={0}
                    max={villa_detail.occupancy - booking_widget.adults - booking_widget.children}
                    className="w-14 border px-2 py-1 rounded"
                    value={booking_widget.infants}
                    onChange={(e) =>
                      handleBookingChange("infants", clamp(Number(e.target.value), 0, villa_detail.occupancy - booking_widget.adults - booking_widget.children))
                    }
                  />
                </div>
                <hr className="my-2" />
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span>{formatCurrency(villa_detail.price_per_night)} × {nights || 0} nights</span>
                    <span>{formatCurrency(villa_detail.price_per_night * nights)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Cleaning fee</span>
                    <span>{formatCurrency(villa_detail.cleaning_fee)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Service fee</span>
                    <span>{formatCurrency(villa_detail.service_fee)}</span>
                  </div>
                  <hr />
                  <div className="flex items-center justify-between font-bold text-primary">
                    <span>Total</span>
                    <span>{formatCurrency(price_breakdown.total)}</span>
                  </div>
                </div>
                {(!user?.user_id || !user.is_email_confirmed) && (
                  <div className="mt-3 text-red-500 text-sm" aria-live="polite">
                    Please <Link to="/auth?mode=login" className="underline text-primary">login and confirm your email</Link> before booking.
                  </div>
                )}
                <button
                  type="button"
                  className={`mt-3 px-5 py-2 rounded text-white font-semibold text-base w-full ${canBook ? "bg-primary hover:bg-primary/90 cursor-pointer" : "bg-gray-300 cursor-not-allowed"}`}
                  disabled={!canBook}
                  onClick={() => {
                    if (!canBook) return;
                    // Pass selection to booking flow
                    const params = new URLSearchParams();
                    if (booking_widget.start_date) params.set("start_date", booking_widget.start_date);
                    if (booking_widget.end_date) params.set("end_date", booking_widget.end_date);
                    params.set("adults", booking_widget.adults.toString());
                    params.set("children", booking_widget.children.toString());
                    params.set("infants", booking_widget.infants.toString());
                    navigate(`/villa/${villa_id}/book?${params.toString()}`);
                  }}
                  aria-label="Reserve and proceed to booking"
                >
                  Book Now
                </button>
              </form>
              <div className="mt-3 text-xs text-gray-500">
                No payment collected yet. Instant booking.
              </div>
            </div>
          </div>
        </div>
        {/* REVIEWS */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-2">Reviews</h2>
          <div className="flex flex-row gap-4 items-center mb-2">
            <span className="text-xl font-bold text-primary">{avgRating ? avgRating.toFixed(2) : "–"} ★</span>
            <span className="text-gray-500 text-sm">{reviews.length || 0} review{reviews.length === 1 ? "" : "s"}</span>
            <Link to={`/reviews?villa_id=${villa_id}`} className="ml-2 underline text-primary text-sm">
              View all reviews
            </Link>
          </div>
          {reviews.length === 0 ? (
            <div className="text-gray-400 italic">No reviews for this villa yet.</div>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {reviews.map((r) => (
                <div key={r.review_id} className="rounded-lg p-4 border bg-white shadow-sm flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-gray-200 w-8 h-8 flex items-center justify-center font-bold text-lg text-primary">
                      {r.reviewer_user_id ? r.reviewer_user_id[0] : "?"}
                    </div>
                    <span className="font-semibold text-gray-800">★ {Number(r.rating).toFixed(1)}</span>
                    <span className="ml-auto text-xs text-gray-500">{formatDate(r.created_at)}</span>
                  </div>
                  <div className="text-gray-700">{r.text || <span className="italic text-gray-400">No text review</span>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* POLICY & CANCELLATION */}
        <div className="mt-12 border-t pt-6 flex flex-col gap-2 text-sm">
          <div>
            <span className="font-bold">Cancellation Policy: </span>
            <span>{villa_detail.cancellation_policy}</span>
          </div>
          <div className="text-xs text-gray-500">Booking is instant upon confirmation. Please review full terms at checkout.</div>
        </div>
      </div>
      {/* --- MODAL: Message Host --- */}
      {showMessageHost && user?.user_id && user.is_email_confirmed && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          tabIndex={-1}
          aria-modal="true"
          role="dialog"
          ref={messageHostModalRef}
        >
          <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg flex flex-col relative outline-none"
               tabIndex={0}
               aria-label="Contact host dialog"
          >
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-700"
              onClick={() => setShowMessageHost(false)}
              aria-label="Close"
              tabIndex={0}
              type="button"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-lg font-bold mb-3">Contact Host</h2>
            <p className="text-sm mb-2 text-gray-600">Start a new conversation with the host about this villa.</p>
            {/* For MVP, show info CTA to go to messages center and start a thread */}
            <Link
              to={`/messages`}
              className="w-full px-5 py-2 rounded bg-primary text-white font-semibold text-center mt-2 hover:bg-primary/90"
              onClick={() => setShowMessageHost(false)}
              tabIndex={0}
            >Go to Messages</Link>
            <div className="mt-2 text-xs text-gray-500">Messaging is available after booking or for pre-booking questions.</div>
          </div>
        </div>
      )}
    </>
  );
};

export default UV_ListingDetails;