import React, { useMemo, useState } from "react";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/main";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

// ---- ZOD TYPE IMPORTS ----
import {
  userSchema,
  updateUserInputSchema,
  villaSchema,
  bookingSchema,
  payoutSchema,
  payoutMethodSchema,
  reviewSchema,
  type User,
  type UpdateUserInput,
  type Villa,
  type Booking,
  type Payout,
  type PayoutMethod,
  type Review,
} from "@schema";

// ---- API BASE URL ----
const API_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// ---- QUERY KEYS ----
const HOST_VILLAS_QK = (host_user_id: string) => [
  "host_villas",
  host_user_id,
];
const HOST_BOOKINGS_QK = (host_user_id: string) => [
  "host_bookings",
  host_user_id,
];
const HOST_PAYOUTS_QK = (host_user_id: string) => [
  "host_payouts",
  host_user_id,
];
const HOST_PAYOUT_METHODS_QK = (host_user_id: string) => [
  "host_payout_methods",
  host_user_id,
];
const HOST_REVIEWS_QK = (user_id: string) => ["host_reviews", user_id];

// ----------- DATA FETCHERS --------------

const fetchMe = async (
  token: string | null
): Promise<User> => {
  const { data } = await axios.get<User>(`${API_URL}/users/me`, {
    headers: { Authorization: token ? `Bearer ${token}` : undefined },
  });
  return userSchema.parse(data);
};

const fetchHostVillas = async (
  host_user_id: string,
  token: string | null
): Promise<Villa[]> => {
  const { data } = await axios.get<Villa[]>(
    `${API_URL}/villas?host_user_id=${encodeURIComponent(host_user_id)}&limit=100`,
    { headers: { Authorization: token ? `Bearer ${token}` : undefined } }
  );
  // zod-validate array
  return z.array(villaSchema).parse(data);
};

const fetchHostBookings = async (
  host_user_id: string,
  token: string | null
): Promise<Booking[]> => {
  const { data } = await axios.get<Booking[]>(
    `${API_URL}/bookings?host_user_id=${encodeURIComponent(host_user_id)}&limit=100`,
    { headers: { Authorization: token ? `Bearer ${token}` : undefined } }
  );
  return z.array(bookingSchema).parse(data);
};

const fetchHostPayouts = async (
  host_user_id: string,
  token: string | null
): Promise<Payout[]> => {
  const { data } = await axios.get<Payout[]>(
    `${API_URL}/payouts?host_user_id=${encodeURIComponent(host_user_id)}&limit=100`,
    { headers: { Authorization: token ? `Bearer ${token}` : undefined } }
  );
  return z.array(payoutSchema).parse(data);
};

const fetchHostPayoutMethods = async (
  host_user_id: string,
  token: string | null
): Promise<PayoutMethod[]> => {
  const { data } = await axios.get<PayoutMethod[]>(
    `${API_URL}/payout-methods?host_user_id=${encodeURIComponent(host_user_id)}&limit=10`,
    { headers: { Authorization: token ? `Bearer ${token}` : undefined } }
  );
  return z.array(payoutMethodSchema).parse(data);
};

const fetchHostReviews = async (
  user_id: string,
  token: string | null
): Promise<Review[]> => {
  const { data } = await axios.get<Review[]>(
    `${API_URL}/reviews?reviewee_user_id=${encodeURIComponent(user_id)}&limit=100`,
    { headers: { Authorization: token ? `Bearer ${token}` : undefined } }
  );
  return z.array(reviewSchema).parse(data);
};

// ----------- MAIN COMPONENT --------------

const UV_HostDashboard: React.FC = () => {
  // Zustand global state access (follow best selector pattern)
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const set_user = useAppStore((s) => s.set_user);
  const set_error_state = useAppStore((s) => s.set_error_state);
  const reset_error_state = useAppStore((s) => s.reset_error_state);
  const set_loader_state = useAppStore((s) => s.set_loader_state);
  const reset_loader_state = useAppStore((s) => s.reset_loader_state);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Defensive--if not host, do not render (guard should be enforced by router)
  if (!user || user.role !== "host") {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="p-6 bg-yellow-50 border border-yellow-200 text-yellow-900 rounded">
          Host view is only available to hosts.
        </div>
      </div>
    );
  }
  // Defensive: user_id
  const host_user_id = user.user_id;
  if (!host_user_id) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="p-6 bg-gray-50 border border-gray-200 text-gray-900 rounded">
          Cannot load dashboard: User not found.
        </div>
      </div>
    );
  }

  // ----------- DATA FETCHES ------------
  // Me/Profile (ensure up-to-date, reload after role switch/profile update)
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useQuery<User>({
    queryKey: ["me", auth_token],
    queryFn: () => fetchMe(auth_token),
    enabled: !!auth_token,
    refetchOnWindowFocus: false,
  });

  // Villas owned by host
  const {
    data: villas,
    isLoading: isVillasLoading,
    isError: isVillasError,
    refetch: refetchVillas,
  } = useQuery<Villa[]>({
    queryKey: HOST_VILLAS_QK(host_user_id),
    queryFn: () => fetchHostVillas(host_user_id, auth_token),
    enabled: !!host_user_id && !!auth_token,
    refetchOnWindowFocus: false,
  });

  // Bookings for host's villas
  const {
    data: bookings,
    isLoading: isBookingsLoading,
    isError: isBookingsError,
    refetch: refetchBookings,
  } = useQuery<Booking[]>({
    queryKey: HOST_BOOKINGS_QK(host_user_id),
    queryFn: () => fetchHostBookings(host_user_id, auth_token),
    enabled: !!host_user_id && !!auth_token,
    refetchOnWindowFocus: false,
  });

  // Payouts (and stats)
  const {
    data: payouts,
    isLoading: isPayoutsLoading,
    isError: isPayoutsError,
    refetch: refetchPayouts,
  } = useQuery<Payout[]>({
    queryKey: HOST_PAYOUTS_QK(host_user_id),
    queryFn: () => fetchHostPayouts(host_user_id, auth_token),
    enabled: !!host_user_id && !!auth_token,
    refetchOnWindowFocus: false,
  });

  // Payout methods
  const {
    data: payoutMethods,
    isLoading: isPayoutMethodsLoading,
    isError: isPayoutMethodsError,
    refetch: refetchPayoutMethods,
  } = useQuery<PayoutMethod[]>({
    queryKey: HOST_PAYOUT_METHODS_QK(host_user_id),
    queryFn: () => fetchHostPayoutMethods(host_user_id, auth_token),
    enabled: !!host_user_id && !!auth_token,
  });

  // Reviews for host (to display average/rating count)
  const {
    data: reviews,
    isLoading: isReviewsLoading,
    isError: isReviewsError,
    refetch: refetchReviews,
  } = useQuery<Review[]>({
    queryKey: HOST_REVIEWS_QK(host_user_id),
    queryFn: () => fetchHostReviews(host_user_id, auth_token),
    enabled: !!host_user_id && !!auth_token,
  });

  // ----------- DERIVED DATA / STATS -----------
  const stats = useMemo(() => {
    // Earnings: sum of completed payouts
    const totalEarnings =
      payouts?.filter((p) => p.status === "completed" || p.status === "paid").reduce((acc, p) => acc + p.amount, 0) ?? 0;
    // Upcoming Bookings: count of bookings in 'confirmed' starting within next 30 days
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const numUpcomingBookings =
      bookings?.filter(
        (b) =>
          b.status === "confirmed" &&
          new Date(b.start_date) >= now &&
          new Date(b.start_date) <= in30d
      ).length ?? 0;
    // Occupancy rate: (%) = (booked days in next 30 / (numVillas * 30))
    let totalBookedDays = 0;
    if (bookings) {
      books: for (const b of bookings) {
        if (b.status === "confirmed") {
          const s = new Date(b.start_date), e = new Date(b.end_date);
          // If ends before now or starts after 30d, skip
          if (e < now || s > in30d) continue;
          const start = s < now ? now : s, end = e > in30d ? in30d : e;
          const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          totalBookedDays += Math.max(diffDays, 0);
        }
      }
    }
    const numVillas = villas?.length ?? 0;
    const occupancyRate =
      numVillas > 0
        ? Math.min(100, Math.round((totalBookedDays / (numVillas * 30)) * 10000) / 100)
        : 0;
    // Average rating (host): avg of all rating fields, non-deleted
    let averageRating = 0;
    if (reviews && reviews.length) {
      const validReviews = reviews.filter((r) => !r.is_deleted);
      averageRating =
        validReviews.length > 0
          ? Math.round(
              (validReviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
                validReviews.length) * 100
            ) / 100
          : 0;
    }
    // Review count
    const reviewCount = reviews?.filter((r) => !r.is_deleted).length ?? 0;

    return {
      totalEarnings,
      numUpcomingBookings,
      occupancyRate,
      averageRating,
      reviewCount,
    };
  }, [payouts, bookings, villas, reviews]);

  // ----------- MUTATIONS ------------

  // 1. Profile update (bio)
  const [bioDraft, setBioDraft] = useState<string>(user.host_bio ?? "");
  const [bioError, setBioError] = useState<string | null>(null);
  const profileMutation = useMutation<User, Error, { host_bio: string }>(
    async ({ host_bio }) => {
      const body: UpdateUserInput = { user_id: host_user_id, host_bio };
      const { data } = await axios.patch<User>(
        `${API_URL}/users/${host_user_id}`,
        body,
        { headers: { Authorization: auth_token ? `Bearer ${auth_token}` : undefined } }
      );
      return userSchema.parse(data);
    },
    {
      onSuccess: (u) => {
        set_user(u, auth_token);
        setBioDraft(u.host_bio ?? "");
        setBioError(null);
        queryClient.invalidateQueries({ queryKey: ["me"] });
      },
      onError: (err) => {
        setBioError(err.message);
        set_error_state({ message: err.message, context: "update_bio" });
      },
    }
  );

  // 2. Booking status change
  const bookingMutation = useMutation<
    Booking,
    Error,
    { booking_id: string; status: string }
  >(
    async ({ booking_id, status }) => {
      // Must provide full UpdateBookingInput
      const body = { booking_id, status };
      const { data } = await axios.patch<Booking>(
        `${API_URL}/bookings/${booking_id}`,
        body,
        { headers: { Authorization: auth_token ? `Bearer ${auth_token}` : undefined } }
      );
      return bookingSchema.parse(data);
    },
    {
      onSuccess: (b) => {
        queryClient.invalidateQueries({ queryKey: HOST_BOOKINGS_QK(host_user_id) });
      },
      onError: (err) => {
        set_error_state({ message: err.message, context: "update_booking" });
      },
    }
  );

  // 3. List remove/unpublish
  const villaDeleteMutation = useMutation<
    void,
    Error,
    { villa_id: string }
  >(
    async ({ villa_id }) => {
      await axios.delete(`${API_URL}/villas/${villa_id}`, {
        headers: { Authorization: auth_token ? `Bearer ${auth_token}` : undefined },
      });
      return;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: HOST_VILLAS_QK(host_user_id) });
      },
      onError: (err) => {
        set_error_state({ message: err.message, context: "delete_villa" });
      },
    }
  );

  // 4. Payouts (manual withdraw)
  const [payoutAmt, setPayoutAmt] = useState<string>("");
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const payoutMutation = useMutation<
    Payout,
    Error,
    { amount: number }
  >(
    async ({ amount }) => {
      // For MVP, just specify host_user_id, amount, status, payout_method (use default if available)
      if (!amount || isNaN(amount) || amount <= 0) throw new Error("Amount must be positive.");
      let method = (payoutMethods && payoutMethods[0]?.method) || "bank_stub";
      const body = {
        host_user_id,
        amount,
        status: "completed",
        payout_method: method,
      };
      const { data } = await axios.post<Payout>(`${API_URL}/payouts`, body, {
        headers: { Authorization: auth_token ? `Bearer ${auth_token}` : undefined },
      });
      return payoutSchema.parse(data);
    },
    {
      onSuccess: () => {
        setPayoutAmt("");
        setPayoutError(null);
        queryClient.invalidateQueries({ queryKey: HOST_PAYOUTS_QK(host_user_id) });
      },
      onError: (err) => {
        setPayoutError(err.message);
        set_error_state({ message: err.message, context: "host_withdraw" });
      },
    }
  );

  // 5. Add payout method (MVP stub)
  const [newMethod, setNewMethod] = useState<string>("");
  const [methodError, setMethodError] = useState<string | null>(null);
  const payoutMethodMutation = useMutation<
    PayoutMethod,
    Error,
    { method: string }
  >(
    async ({ method }) => {
      if (!method) throw new Error("Payout method is required.");
      const body = { host_user_id, method };
      const { data } = await axios.post<PayoutMethod>(
        `${API_URL}/payout-methods`,
        body,
        { headers: { Authorization: auth_token ? `Bearer ${auth_token}` : undefined } }
      );
      return payoutMethodSchema.parse(data);
    },
    {
      onSuccess: () => {
        setNewMethod("");
        setMethodError(null);
        refetchPayoutMethods();
      },
      onError: (err) => {
        setMethodError(err.message);
        set_error_state({ message: err.message, context: "add_payout_method" });
      },
    }
  );

  // 6. Switch role to guest (PATCH /users/:user_id)
  const [switchingRole, setSwitchingRole] = useState(false);
  const roleMutation = useMutation<User, Error, { role: string }>(
    async (payload) => {
      const body = { user_id: host_user_id, role: payload.role };
      const { data } = await axios.patch<User>(
        `${API_URL}/users/${host_user_id}`,
        body,
        { headers: { Authorization: auth_token ? `Bearer ${auth_token}` : undefined } }
      );
      return userSchema.parse(data);
    },
    {
      onMutate: () => setSwitchingRole(true),
      onSuccess: (u) => {
        set_user(u, auth_token);
        setSwitchingRole(false);
        navigate("/dashboard/guest");
      },
      onError: (err) => {
        setSwitchingRole(false);
        set_error_state({ message: err.message, context: "switch_role" });
      },
    }
  );

  // ------------ MAIN DASHBOARD RENDER ----------------
  return (
    <>
      <div className="max-w-7xl mx-auto w-full py-8 px-2 sm:px-4 md:px-6">
        {/* HEADER + Stats */}
        <div className="flex flex-col md:flex-row md:items-center mb-8 gap-4">
          <div className="flex flex-row items-center gap-4 flex-1">
            <img
              src={user.profile_photo_url || `https://picsum.photos/seed/${user.user_id || "default"}/80/80`}
              alt="Host avatar"
              className="w-20 h-20 rounded-full border border-gray-200 object-cover"
              loading="lazy"
            />
            <div>
              <h1 className="text-2xl font-bold mb-1 text-gray-900">
                Welcome, {user.name}
              </h1>
              <div className="flex gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 text-xs font-semibold">
                  Host
                </span>
                {user.is_email_confirmed ? (
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-semibold">
                    Email Confirmed
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-yellow-50 text-yellow-800 text-xs font-semibold">
                    Email Unconfirmed
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-row flex-wrap gap-2">
            <Link
              className="px-3 py-2 bg-blue-600 hover:bg-blue-800 rounded text-white font-bold text-sm shadow transition"
              to="/dashboard/host/add-listing"
            >
              + Add New Listing
            </Link>
            <Link
              to="/messages"
              className="px-3 py-2 bg-white border border-blue-600 rounded text-blue-700 font-bold text-sm hover:bg-blue-50 flex items-center gap-1"
              aria-label="Messaging center"
            >
              📨 Messaging
            </Link>
          </div>
        </div>

        {/* --- SUMMARY TILES --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
          <div className="rounded-lg bg-gradient-to-tr from-pink-100 via-pink-200 to-pink-100 p-5 flex flex-col" aria-label="Total Earnings">
            <span className="text-xs text-pink-700 font-semibold mb-1">Total Earnings</span>
            <span className="text-xl md:text-2xl font-bold text-pink-900">${stats.totalEarnings.toLocaleString()}</span>
          </div>
          <div className="rounded-lg bg-gradient-to-tr from-indigo-100 via-indigo-200 to-indigo-100 p-5 flex flex-col" aria-label="Upcoming Bookings">
            <span className="text-xs text-indigo-700 font-semibold mb-1">Upcoming Bookings (next 30d)</span>
            <span className="text-xl md:text-2xl font-bold text-indigo-900">{stats.numUpcomingBookings}</span>
          </div>
          <div className="rounded-lg bg-gradient-to-tr from-yellow-100 via-yellow-200 to-yellow-100 p-5 flex flex-col" aria-label="Occupancy Rate">
            <span className="text-xs text-yellow-700 font-semibold mb-1">Occupancy Rate</span>
            <span className="text-xl md:text-2xl font-bold text-yellow-900">{stats.occupancyRate}%</span>
          </div>
          <div className="rounded-lg bg-gradient-to-tr from-emerald-100 via-emerald-200 to-emerald-100 p-5 flex flex-col" aria-label="Review Score">
            <span className="text-xs text-emerald-700 font-semibold mb-1">Review Score</span>
            <span className="text-xl md:text-2xl font-bold text-emerald-900">{stats.averageRating} <span className="font-mono text-emerald-500">★</span></span>
            <span className="text-xs text-emerald-600">{stats.reviewCount} reviews</span>
          </div>
        </div>

        {/* ---- TABS ---- */}
        <div className="flex flex-row gap-2 mb-6 border-b border-gray-200">
          <a href="#listings" className="px-3 py-2 text-blue-700 font-semibold border-b-2 border-blue-600">Listings</a>
          <a href="#bookings" className="px-3 py-2 text-gray-700 font-semibold">Bookings</a>
          <a href="#payouts" className="px-3 py-2 text-gray-700 font-semibold">Payouts</a>
          <a href="#profile" className="px-3 py-2 text-gray-700 font-semibold">Profile</a>
        </div>

        {/* === LISTINGS TABLE === */}
        <section id="listings" aria-labelledby="listings-title" className="mb-12">
          <h2 className="text-lg font-bold flex items-center mb-3" id="listings-title">Your Listings</h2>
          {isVillasLoading ? (
            <div className="py-8 flex items-center justify-center"><span className="text-gray-400">Loading...</span></div>
          ) : isVillasError ? (
            <div className="text-red-700 py-4" aria-live="polite">Error loading listings.</div>
          ) : !villas || villas.length === 0 ? (
            <div className="py-8 flex flex-col items-center text-gray-500 text-center">
              <span className="mb-2">You have no listings yet.</span>
              <Link className="text-blue-700 hover:underline" to="/dashboard/host/add-listing">Add your first villa</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-t border-b border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-2 text-left">Photo</th>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Occupancy</th>
                    <th className="px-2 py-2">Rating</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {villas.map((villa) => (
                    <tr key={villa.villa_id} className="border-b hover:bg-gray-50">
                      <td className="px-2 py-2">
                        <img
                          src={`https://picsum.photos/seed/${villa.villa_id}/72/54`}
                          alt=""
                          className="rounded-md border border-gray-200 w-20 h-14 object-cover"
                          width={72}
                          height={54}
                          loading="lazy"
                        />
                      </td>
                      <td className="px-2 py-2 font-semibold">
                        <Link to={`/villa/${villa.villa_id}`} className="text-blue-700 hover:underline">
                          {villa.name}
                        </Link>
                        <div className="text-xs text-gray-500">{villa.location}</div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={
                            villa.status === "published"
                              ? "text-green-700 bg-green-50 rounded px-2 py-0.5 font-medium"
                              : "text-gray-700 bg-gray-100 rounded px-2 py-0.5 font-medium"
                          }
                        >
                          {villa.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">{villa.occupancy}</td>
                      <td className="px-2 py-2 text-center">
                        {villa.average_rating} <span className="text-yellow-500 font-mono">★</span>
                        <span className="ml-1 text-xs text-gray-700">({villa.review_count})</span>
                      </td>
                      <td className="px-2 py-2 text-center flex flex-col gap-1 items-center">
                        <Link
                          to={`/dashboard/host/edit-listing/${villa.villa_id}`}
                          className="text-blue-600 hover:text-blue-900 px-2 py-1 rounded font-bold text-xs bg-blue-50"
                          aria-label="Edit listing"
                          tabIndex={0}
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => villaDeleteMutation.mutate({ villa_id: villa.villa_id })}
                          className="text-red-600 hover:text-white hover:bg-red-600 border border-red-400 px-2 py-1 rounded font-bold text-xs transition"
                          aria-label="Delete listing"
                          tabIndex={0}
                        >
                          Delete
                        </button>
                        <Link
                          to={`/villa/${villa.villa_id}`}
                          className="text-gray-600 hover:underline font-bold text-xs"
                          tabIndex={0}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* === BOOKINGS MANAGEMENT === */}
        <section id="bookings" aria-labelledby="bookings-title" className="mb-12">
          <h2 className="text-lg font-bold flex items-center mb-3" id="bookings-title">Bookings</h2>
          {isBookingsLoading ? (
            <div className="py-8 flex items-center justify-center"><span className="text-gray-400">Loading...</span></div>
          ) : isBookingsError ? (
            <div className="text-red-700 py-4" aria-live="polite">Could not load bookings.</div>
          ) : !bookings || bookings.length === 0 ? (
            <div className="py-8 text-gray-500">No bookings yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-t border-b border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2">Villa</th>
                    <th className="p-2">Guest</th>
                    <th className="p-2">Dates</th>
                    <th className="p-2">Guests</th>
                    <th className="p-2">Total Price</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.booking_id} className="border-b hover:bg-gray-50">
                      <td className="p-2 text-blue-800 font-semibold">
                        <Link to={`/villa/${b.villa_id}`}>{villas?.find(v => v.villa_id === b.villa_id)?.name || "Villa"}</Link>
                      </td>
                      <td className="p-2">
                        <Link to={`/messages?thread_booking_id=${b.booking_id}`} className="text-blue-700 hover:underline">
                          {b.guest_user_id.slice(-6)}
                        </Link>
                      </td>
                      <td className="p-2">
                        {new Date(b.start_date).toLocaleDateString()} – {new Date(b.end_date).toLocaleDateString()}
                      </td>
                      <td className="p-2 text-center">{b.adults + (b.children || 0) + (b.infants || 0)}</td>
                      <td className="p-2 text-center">${b.total_price}</td>
                      <td className="p-2 text-center">
                        <span
                          className={
                            b.status === "confirmed"
                              ? "bg-green-50 text-green-800 px-2 py-0.5 rounded font-medium text-xs"
                              : b.status === "pending"
                              ? "bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded font-medium text-xs"
                              : "bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium text-xs"
                          }
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="p-2 flex flex-col gap-0.5">
                        {b.status === "pending" && (
                          <>
                            <button
                              onClick={() =>
                                bookingMutation.mutate({
                                  booking_id: b.booking_id,
                                  status: "confirmed",
                                })
                              }
                              className="bg-green-600 text-white hover:bg-green-700 rounded px-2 py-1 font-bold text-xs"
                              aria-label="Approve booking"
                              tabIndex={0}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                bookingMutation.mutate({
                                  booking_id: b.booking_id,
                                  status: "rejected",
                                })
                              }
                              className="bg-red-600 text-white hover:bg-red-700 rounded px-2 py-1 font-bold text-xs"
                              aria-label="Reject booking"
                              tabIndex={0}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {b.status === "confirmed" && (
                          <button
                            onClick={() =>
                              bookingMutation.mutate({
                                booking_id: b.booking_id,
                                status: "cancelled",
                              })
                            }
                            className="bg-yellow-600 text-white hover:bg-yellow-700 rounded px-2 py-1 font-bold text-xs"
                            aria-label="Cancel booking"
                            tabIndex={0}
                          >
                            Cancel
                          </button>
                        )}
                        <Link
                          to={`/booking/${b.booking_id}`}
                          className="text-blue-700 text-xs mt-1 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* === PAYOUTS === */}
        <section id="payouts" aria-labelledby="payouts-title" className="mb-12">
          <h2 className="text-lg font-bold flex items-center mb-3" id="payouts-title">Payouts & Earnings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* --- Payout summary + withdraw --- */}
            <div>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="mb-2">
                  <span className="text-gray-800 font-semibold">Total Earnings Paid:</span>
                  <span className="ml-2 text-pink-700 font-bold">${stats.totalEarnings.toLocaleString()}</span>
                </div>
                <div className="mb-2">
                  <span className="text-gray-800 font-semibold">Active Payout Method:</span>
                  <span className="ml-2">{payoutMethods && payoutMethods.length ? payoutMethods[0].method : <span className="text-gray-500">None configured</span>}</span>
                </div>
                <form
                  className="flex flex-col gap-2 mt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPayoutError(null);
                    payoutMutation.mutate({ amount: Number(payoutAmt) });
                  }}
                >
                  <div>
                    <label htmlFor="payout_amount" className="block text-xs mb-1 text-gray-800 font-semibold">
                      Withdraw Amount
                    </label>
                    <input
                      id="payout_amount"
                      className="border border-gray-300 rounded p-2 w-32 text-right"
                      type="number"
                      value={payoutAmt}
                      min="1"
                      step="0.01"
                      onChange={(e) => {
                        setPayoutError(null);
                        setPayoutAmt(e.target.value.replace(/[^0-9.]/g, ""));
                      }}
                      inputMode="decimal"
                      pattern="[0-9]+(\.[0-9]{1,2})?"
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-pink-600 hover:bg-pink-700 text-white font-bold px-3 py-2 rounded text-sm"
                    aria-label="Withdraw"
                    tabIndex={0}
                  >
                    Withdraw (Simulate)
                  </button>
                  {payoutError && (
                    <div className="text-red-700 text-xs mt-1" aria-live="polite">
                      {payoutError}
                    </div>
                  )}
                  {payoutMutation.isSuccess && (
                    <div className="text-green-700 text-xs mt-1" aria-live="polite">
                      Withdrawal simulated! Check payout history below.
                    </div>
                  )}
                </form>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <span className="text-gray-800 font-semibold">Add Payout Method (MVP):</span>
                <form
                  className="flex gap-2 items-center mt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setMethodError(null);
                    payoutMethodMutation.mutate({ method: newMethod });
                  }}
                >
                  <input
                    className="border border-gray-300 rounded p-2 w-48"
                    type="text"
                    placeholder="e.g. Bank Account, PayPal"
                    value={newMethod}
                    maxLength={32}
                    autoComplete="off"
                    onChange={(e) => {
                      setMethodError(null);
                      setNewMethod(e.target.value);
                    }}
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded text-sm"
                    aria-label="Add payout method"
                    tabIndex={0}
                  >
                    Add
                  </button>
                </form>
                {methodError && (
                  <div className="text-red-700 text-xs mt-1" aria-live="polite">
                    {methodError}
                  </div>
                )}
                {payoutMethodMutation.isSuccess && (
                  <div className="text-green-700 text-xs mt-1" aria-live="polite">
                    Payout method added/updated.
                  </div>
                )}
              </div>
            </div>
            {/* --- Payout history --- */}
            <div>
              <h3 className="font-semibold mb-2 text-gray-700">Payout History</h3>
              {!payouts || !payouts.length ? (
                <div className="text-gray-500">No payouts yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-t border-b border-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Amount</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((p) => (
                        <tr key={p.payout_id} className="border-b">
                          <td className="px-2 py-2">{p.payout_date ? new Date(p.payout_date).toLocaleDateString() : "---"}</td>
                          <td className="px-2 py-2">${p.amount.toLocaleString()}</td>
                          <td className="px-2 py-2">{p.status}</td>
                          <td className="px-2 py-2">{p.payout_method}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* === PROFILE === */}
        <section id="profile" aria-labelledby="profile-title" className="mb-12">
          <h2 className="text-lg font-bold mb-3" id="profile-title">
            My Host Profile
          </h2>
          <div className="max-w-xl">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setBioError(null);
                profileMutation.mutate({ host_bio: bioDraft });
              }}
            >
              <label htmlFor="host_bio" className="text-xs text-gray-700 font-semibold">
                Short Host Bio:
              </label>
              <textarea
                id="host_bio"
                rows={4}
                maxLength={1000}
                className="border border-gray-300 rounded p-2"
                value={bioDraft}
                onChange={(e) => {
                  setBioError(null);
                  setBioDraft(e.target.value);
                }}
                aria-label="Host bio"
                tabIndex={0}
              />
              <div className="flex flex-row gap-2 items-center mt-1">
                <button
                  disabled={profileMutation.isLoading}
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 font-bold text-sm flex items-center gap-2 transition disabled:bg-gray-200 disabled:text-gray-700"
                  aria-label="Update bio"
                >
                  {profileMutation.isLoading ? "Updating..." : "Update Bio"}
                </button>
                {bioError && (
                  <span className="ml-3 text-red-700 text-xs" aria-live="polite">{bioError}</span>
                )}
                {profileMutation.isSuccess && (
                  <span className="ml-3 text-green-700 text-xs" aria-live="polite">Bio updated!</span>
                )}
              </div>
            </form>
            {/* Simulate payout method & role switching */}
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                className="bg-gray-700 hover:bg-gray-900 text-white rounded px-4 py-2 font-bold text-sm"
                aria-label="Switch to guest role"
                onClick={() => roleMutation.mutate({ role: "guest" })}
                disabled={switchingRole}
                tabIndex={0}
              >
                {switchingRole ? "Switching..." : "Switch to Guest View"}
              </button>
              <button
                type="button"
                className="bg-red-700 hover:bg-red-900 text-white rounded px-4 py-2 font-bold text-sm"
                aria-label="Log out"
                onClick={() => logout()}
                tabIndex={0}
              >
                Log Out
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default UV_HostDashboard;