import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
import { Link } from "react-router-dom";
import { z } from "zod";

// ---- Zod type imports (from shared schemas) ----
import type {
  User,
  UpdateUserInput,
  Booking,
  Villa,
  Review,
} from "@schema";

// ---- Backend endpoints ----
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// ---- Helper: Date utils ----
const todayISO = () => new Date().toISOString().slice(0, 10);
const isPastDate = (date: string) => new Date(date) < new Date();
const isFutureOrToday = (date: string) => new Date(date) >= new Date();

// ---- Booking filters ----
function groupBookings(bookings: Booking[]) {
  const now = new Date();
  const upcoming: Booking[] = [];
  const past: Booking[] = [];
  const canceled: Booking[] = [];
  for (const b of bookings) {
    if (
      (b.status === "cancelled" || b.status === "rejected") ||
      (b.cancellation_reason && b.status !== "confirmed")
    ) {
      canceled.push(b);
    } else if (
      (b.status === "pending" || b.status === "confirmed") &&
      new Date(b.start_date) >= now
    ) {
      upcoming.push(b);
    } else if (new Date(b.end_date) < now && b.status !== "cancelled") {
      past.push(b);
    } else if (b.status === "confirmed") {
      if (new Date(b.end_date) < now) past.push(b);
      else if (new Date(b.start_date) <= now) upcoming.push(b);
    }
  }
  return { upcoming, past, canceled };
}

// ---- API hooks ----
const fetchUserProfile = async (token: string): Promise<User> => {
  const { data } = await axios.get(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
};

const fetchBookings = async (token: string, user_id: string): Promise<Booking[]> => {
  const { data } = await axios.get(
    `${API_BASE}/bookings?guest_user_id=${encodeURIComponent(user_id)}&limit=50&sort_by=start_date&sort_order=desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
};

const fetchVilla = async (villa_id: string, token: string): Promise<Villa> => {
  const { data } = await axios.get(
    `${API_BASE}/villas/${encodeURIComponent(villa_id)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
};

const fetchReview = async ({
  booking_id,
  reviewer_user_id,
  token,
}: {
  booking_id: string;
  reviewer_user_id: string;
  token: string;
}): Promise<Review | null> => {
  // Fetches review for this booking by this user
  const { data } = await axios.get(
    `${API_BASE}/reviews?booking_id=${encodeURIComponent(booking_id)}&reviewer_user_id=${encodeURIComponent(
      reviewer_user_id
    )}&is_deleted=false&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data && Array.isArray(data) && data[0] ? data[0] : null;
};

// ---- Booking cancel mutation ----
const cancelBooking = async ({
  booking_id,
  token,
}: {
  booking_id: string;
  token: string;
}) => {
  const patch = { booking_id, status: "cancelled" };
  const { data } = await axios.patch(
    `${API_BASE}/bookings/${encodeURIComponent(booking_id)}`,
    patch,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
};

// ---- Profile update mutation ----
const patchProfile = async ({
  user_id,
  input,
  token,
}: {
  user_id: string;
  input: Partial<UpdateUserInput>;
  token: string;
}) => {
  const payload: UpdateUserInput = { user_id, ...input };
  const { data } = await axios.patch(
    `${API_BASE}/users/${encodeURIComponent(user_id)}`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
};

// ---- Switch to host mutation ----
const switchToHost = async ({
  user_id,
  token,
}: {
  user_id: string;
  token: string;
}) => {
  const payload: UpdateUserInput = { user_id, role: "host" };
  const { data } = await axios.patch(
    `${API_BASE}/users/${encodeURIComponent(user_id)}`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
};

const UV_GuestDashboard: React.FC = () => {
  // ----- Global State -----
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);

  // For success/failure notifications
  const set_error_state = useAppStore((s) => s.set_error_state);
  const reset_error_state = useAppStore((s) => s.reset_error_state);
  const set_loader_state = useAppStore((s) => s.set_loader_state);
  const reset_loader_state = useAppStore((s) => s.reset_loader_state);

  // ----- Local State -----
  const [activeTab, setActiveTab] = React.useState<"bookings" | "profile" | "saved">("bookings");
  const [editingProfile, setEditingProfile] = React.useState(false);

  // Editable profile state
  const [profileForm, setProfileForm] = React.useState<Partial<User>>({});
  const [profileErrors, setProfileErrors] = React.useState<Record<string, string | null>>({});
  const [profileSuccess, setProfileSuccess] = React.useState<string | null>(null);

  // Cancel modal/click state
  const [cancelBookingId, setCancelBookingId] = React.useState<string | null>(null);

  // Query Client
  const queryClient = useQueryClient();

  // Guard: user and token required (should be enforced by routing)
  React.useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name,
        email: user.email,
        profile_photo_url: user.profile_photo_url ?? "",
        contact_info:
          typeof user.contact_info === "object" && user.contact_info
            ? (user.contact_info as any).phone ?? ""
            : typeof user.contact_info === "string"
            ? user.contact_info
            : "",
      });
    }
  }, [user]);

  // ---- React Query: user profile ----
  const userProfileQuery = useQuery<User>({
    queryKey: ["userProfile"],
    queryFn: async () => {
      if (!auth_token) throw new Error("Not authenticated.");
      return fetchUserProfile(auth_token);
    },
    enabled: !!auth_token,
    staleTime: 5 * 60 * 1000,
  });

  // ---- React Query: bookings ----
  const bookingsQuery = useQuery<Booking[]>({
    queryKey: ["myBookings"],
    queryFn: async () => {
      if (!auth_token || !user || !user.user_id) throw new Error("Not authenticated.");
      return fetchBookings(auth_token, user.user_id);
    },
    enabled: !!user && !!auth_token,
    staleTime: 2 * 60 * 1000,
  });

  // ---- Booking grouping ----
  const { upcoming, past, canceled } = React.useMemo(
    () => (bookingsQuery.data ? groupBookings(bookingsQuery.data) : { upcoming: [], past: [], canceled: [] }),
    [bookingsQuery.data]
  );

  // ---- Villas: build villa id set ----
  const villaIdsSet = React.useMemo(() => {
    const ids = new Set<string>();
    for (const b of bookingsQuery.data || []) ids.add(b.villa_id);
    return Array.from(ids);
  }, [bookingsQuery.data]);
  // Villas: Map of villa_id => Villa
  const villaQueries = villaIdsSet.map((villa_id) =>
    useQuery<Villa>({
      queryKey: ["villa", villa_id],
      queryFn: async () => fetchVilla(villa_id, auth_token!),
      enabled: !!auth_token && !!villa_id,
      staleTime: 10 * 60 * 1000,
    })
  );
  const villasMap = villaQueries.reduce<Record<string, Villa>>((map, q, idx) => {
    if (q.data) map[q.data.villa_id] = q.data;
    return map;
  }, {});

  // ---- Reviews for past bookings ----
  // Only for past bookings do we care if review was given
  const reviewQueries = past.map((b) =>
    useQuery<Review | null>({
      queryKey: ["review", { booking_id: b.booking_id, reviewer_user_id: user?.user_id }],
      queryFn: async () =>
        !!auth_token && !!user?.user_id ? fetchReview({ booking_id: b.booking_id, reviewer_user_id: user.user_id, token: auth_token }) : null,
      enabled: !!auth_token && !!user?.user_id && !!b.booking_id,
      staleTime: 10 * 60 * 1000,
    })
  );
  const bookingReviewMap: Record<string, Review | null> = {};
  past.forEach((b, i) => {
    bookingReviewMap[b.booking_id] = reviewQueries[i]?.data ?? null;
  });

  // ---- Cancel Booking Mutation ----
  const cancelBookingMutation = useMutation({
    mutationFn: async (booking_id: string) => {
      if (!auth_token) throw new Error("Not authenticated");
      set_loader_state({ is_loading: true, context: "cancel_booking" });
      return cancelBooking({ booking_id, token: auth_token });
    },
    onSuccess: () => {
      reset_loader_state();
      queryClient.invalidateQueries({ queryKey: ["myBookings"] });
      setCancelBookingId(null);
    },
    onError: (err: any) => {
      reset_loader_state();
      set_error_state({ message: err?.response?.data?.error || err?.message || "Error cancelling booking", context: "cancel_booking" });
    },
  });

  // ---- Profile PATCH Mutation ----
  const updateProfileMutation = useMutation({
    mutationFn: async (input: Partial<UpdateUserInput>) => {
      if (!auth_token || !user) throw new Error("Not authenticated");
      set_loader_state({ is_loading: true, context: "profile_update" });
      // zod validation, but let the backend error if not right as well
      const valid = z
        .object({
          name: z.string().min(1).max(255).optional(),
          profile_photo_url: z.string().url().nullable().optional(),
          email: z.string().email().optional(),
          contact_info: z.string().max(255).nullable().optional(),
        })
        .safeParse(input);
      if (!valid.success) throw new Error("Validation error: check fields");
      return patchProfile({ user_id: user.user_id, input, token: auth_token });
    },
    onSuccess: (data) => {
      reset_loader_state();
      setProfileSuccess("Profile updated!");
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      setTimeout(() => setProfileSuccess(null), 2000);
      setEditingProfile(false);
    },
    onError: (err: any) => {
      reset_loader_state();
      setProfileErrors((prev) => ({ ...prev, global: err?.response?.data?.error || err?.message || "Profile update failed" }));
    },
  });

  // ---- Switch to Host Mutation ----
  const switchToHostMutation = useMutation({
    mutationFn: async () => {
      if (!user || !auth_token) throw new Error("Not authenticated");
      set_loader_state({ is_loading: true, context: "switch_host" });
      return switchToHost({ user_id: user.user_id, token: auth_token });
    },
    onSuccess: () => {
      reset_loader_state();
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      window.location.href = "/dashboard/host"; // route to host dashboard
    },
    onError: (err: any) => {
      reset_loader_state();
      set_error_state({ message: err?.response?.data?.error || err?.message || "Switch failed", context: "switch_host" });
    },
  });

  // ---- Tab Switch Handler ----
  const handleTabChange = (tab: "bookings" | "profile" | "saved") => {
    setActiveTab(tab);
    reset_error_state();
    setProfileSuccess(null);
  };

  // ---- Profile form handlers ----
  const handleProfileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileErrors({});
    const { name, value } = e.target;
    setProfileForm((prev) => ({ ...prev, [name]: value }));
  };
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErrors({});
    setProfileSuccess(null);
    updateProfileMutation.mutate({
      name: profileForm.name,
      profile_photo_url: profileForm.profile_photo_url || null,
      contact_info: profileForm.contact_info ?? null,
      email: profileForm.email,
    });
  };

  // ---- Render ----
  return (
    <>
      <main className="max-w-5xl mx-auto py-8 px-4 sm:px-8">
        <h1 className="text-3xl font-bold mb-2">Welcome, {user?.name || "Guest"}!</h1>
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            tabIndex={0}
            aria-current={activeTab === "bookings"}
            className={`py-2 px-3 font-semibold border-b-2 transition-all ${
              activeTab === "bookings"
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:text-primary-600"
            }`}
            onClick={() => handleTabChange("bookings")}
            aria-label="View Bookings Tab"
          >
            My Bookings
          </button>
          <button
            tabIndex={0}
            aria-current={activeTab === "saved"}
            className={`py-2 px-3 font-semibold border-b-2 transition-all ${
              activeTab === "saved"
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:text-primary-600"
            }`}
            onClick={() => handleTabChange("saved")}
            aria-label="View Saved Villas Tab"
          >
            Saved Villas
          </button>
          <button
            tabIndex={0}
            aria-current={activeTab === "profile"}
            className={`py-2 px-3 font-semibold border-b-2 transition-all ${
              activeTab === "profile"
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:text-primary-600"
            }`}
            onClick={() => handleTabChange("profile")}
            aria-label="View Profile Tab"
          >
            Profile
          </button>
        </div>

        {activeTab === "bookings" && (
          <section>
            {bookingsQuery.isLoading ? (
              <div className="py-12 text-center text-gray-500">
                <span>Loading bookings…</span>
              </div>
            ) : bookingsQuery.isError ? (
              <div className="py-6 bg-red-50 text-red-700 text-center rounded">Error loading bookings.</div>
            ) : (
              <>
                {/* UPCOMING BOOKINGS */}
                <h2 className="mb-2 text-xl font-bold">Upcoming</h2>
                {upcoming.length === 0 && (
                  <div className="mb-4 p-4 text-center text-gray-400">
                    No upcoming bookings.{" "}
                    <Link to="/search" className="text-primary-600 underline">
                      Find your next cliff villa!
                    </Link>
                  </div>
                )}
                <div className="flex flex-wrap gap-4 mb-8">
                  {upcoming.map((b) => {
                    const v = villasMap[b.villa_id];
                    return (
                      <div key={b.booking_id} className="rounded-lg shadow p-4 w-full sm:w-[350px] bg-white border">
                        <Link to={`/booking/${b.booking_id}`} tabIndex={0} className="block mb-2 group focus:outline-none">
                          <div className="h-44 rounded-md bg-gray-100 mb-3 flex items-center justify-center overflow-hidden">
                            {v?.villa_id && (
                              <img
                                src={`https://picsum.photos/seed/${v.villa_id}/350/180`}
                                alt={v.name}
                                className="object-cover h-full w-full group-hover:scale-105 transition"
                              />
                            )}
                          </div>
                          <div className="font-semibold text-lg">{v?.name || "Villa"}</div>
                          <div className="text-gray-500 text-sm">{b.start_date} &rarr; {b.end_date}</div>
                        </Link>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="inline-block px-2 py-1 text-xs rounded bg-primary-50 text-primary-700 font-semibold uppercase">{b.status}</span>
                          <span className="ml-auto font-semibold">${b.total_price.toFixed(2)}</span>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Link
                            to={`/booking/${b.booking_id}`}
                            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-primary-100 text-primary-700"
                            tabIndex={0}
                          >
                            View Details
                          </Link>
                          {b.status === "confirmed" && isFutureOrToday(b.start_date) && (
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700"
                              onClick={() => setCancelBookingId(b.booking_id)}
                              aria-label="Cancel Booking"
                            >
                              Cancel
                            </button>
                          )}
                          <Link
                            to={`/messages?thread_id=&booking_id=${b.booking_id}`}
                            className="text-xs px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-700"
                            tabIndex={0}
                            aria-label="Message Host"
                          >
                            Message Host
                          </Link>
                        </div>
                        {cancelBookingMutation.isLoading && cancelBookingId === b.booking_id && (
                          <div className="mt-3 text-xs text-gray-500">Processing cancellation…</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* PAST BOOKINGS */}
                <h2 className="mb-2 text-xl font-bold">Past</h2>
                {past.length === 0 && (
                  <div className="mb-4 p-4 text-center text-gray-400">
                    No past bookings yet.
                  </div>
                )}
                <div className="flex flex-wrap gap-4 mb-8">
                  {past.map((b) => {
                    const v = villasMap[b.villa_id];
                    const hasReview = !!bookingReviewMap[b.booking_id];
                    return (
                      <div key={b.booking_id} className="rounded-lg shadow p-4 w-full sm:w-[350px] bg-white border">
                        <Link to={`/booking/${b.booking_id}`} tabIndex={0} className="block mb-2 group focus:outline-none">
                          <div className="h-44 rounded-md bg-gray-100 mb-3 flex items-center justify-center overflow-hidden">
                            {v?.villa_id && (
                              <img
                                src={`https://picsum.photos/seed/${v.villa_id}/350/180`}
                                alt={v.name}
                                className="object-cover h-full w-full group-hover:scale-105 transition"
                              />
                            )}
                          </div>
                          <div className="font-semibold text-lg">{v?.name || "Villa"}</div>
                          <div className="text-gray-500 text-sm">{b.start_date} &rarr; {b.end_date}</div>
                        </Link>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="inline-block px-2 py-1 text-xs rounded bg-primary-50 text-primary-700 font-semibold uppercase">{b.status}</span>
                          <span className="ml-auto font-semibold">${b.total_price.toFixed(2)}</span>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Link
                            to={`/booking/${b.booking_id}`}
                            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-primary-100 text-primary-700"
                            tabIndex={0}
                          >
                            View Details
                          </Link>
                          <Link
                            to={`/messages?thread_id=&booking_id=${b.booking_id}`}
                            className="text-xs px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-700"
                            tabIndex={0}
                            aria-label="Message Host"
                          >
                            Message Host
                          </Link>
                          {!hasReview && (
                            <Link
                              to={`/reviews?booking_id=${b.booking_id}`}
                              className="text-xs px-2 py-1 rounded bg-green-100 hover:bg-green-200 text-green-800"
                              tabIndex={0}
                              aria-label="Write Review"
                            >
                              Write Review
                            </Link>
                          )}
                          {hasReview && (
                            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500" aria-live="polite">
                              Reviewed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CANCELED BOOKINGS */}
                <h2 className="mb-2 text-xl font-bold">Canceled</h2>
                {canceled.length === 0 && (
                  <div className="mb-4 p-4 text-center text-gray-400">
                    No canceled bookings.
                  </div>
                )}
                <div className="flex flex-wrap gap-4">
                  {canceled.map((b) => {
                    const v = villasMap[b.villa_id];
                    return (
                      <div key={b.booking_id} className="rounded-lg shadow p-4 w-full sm:w-[350px] bg-gray-50 border">
                        <Link to={`/booking/${b.booking_id}`} className="block mb-2 group focus:outline-none">
                          <div className="h-44 rounded-md bg-gray-100 mb-3 flex items-center justify-center overflow-hidden">
                            {v?.villa_id && (
                              <img
                                src={`https://picsum.photos/seed/${v.villa_id}/350/180`}
                                alt={v.name}
                                className="object-cover h-full w-full group-hover:scale-105 transition"
                              />
                            )}
                          </div>
                          <div className="font-semibold text-lg">{v?.name || "Villa"}</div>
                          <div className="text-gray-500 text-sm">{b.start_date} &rarr; {b.end_date}</div>
                        </Link>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="inline-block px-2 py-1 text-xs rounded bg-red-50 text-red-600 font-semibold uppercase">Canceled</span>
                          <span className="ml-auto font-semibold">${b.total_price.toFixed(2)}</span>
                        </div>
                        <div className="mt-2 text-xs text-gray-400">
                          {b.cancellation_reason ? <>Reason: {b.cancellation_reason}</> : null}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Link
                            to={`/booking/${b.booking_id}`}
                            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-primary-100 text-primary-700"
                            tabIndex={0}
                            aria-label="View details"
                          >
                            View Details
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ------- MODAL for cancelling ------- */}
                {cancelBookingId && (
                  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
                      <h3 className="text-xl font-bold mb-4">Cancel Booking?</h3>
                      <p>Are you sure you want to cancel this booking?</p>
                      <div className="flex gap-4 mt-6">
                        <button
                          className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                          onClick={() => setCancelBookingId(null)}
                          tabIndex={0}
                        >
                          Nevermind
                        </button>
                        <button
                          className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => cancelBookingMutation.mutate(cancelBookingId)}
                          aria-label="Confirm cancellation"
                          disabled={cancelBookingMutation.isLoading}
                          tabIndex={0}
                        >
                          {cancelBookingMutation.isLoading ? "Cancelling…" : "Yes, Cancel"}
                        </button>
                      </div>
                      {cancelBookingMutation.isError && (
                        <div className="mt-2 text-red-600" aria-live="polite">
                          Failed to cancel: {cancelBookingMutation.error instanceof Error ? cancelBookingMutation.error.message : "Error"}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === "saved" && (
          <section>
            <h2 className="mb-4 text-xl font-bold">Your Saved Villas</h2>
            <div className="mb-8">
              <Link
                to="/saved-villas"
                className="text-primary-700 underline font-semibold"
                tabIndex={0}
                aria-label="Go to Saved Villas Page"
              >
                Manage or explore your saved/favorited villas in detail &rarr;
              </Link>
            </div>
          </section>
        )}

        {activeTab === "profile" && (
          <section className="max-w-lg mx-auto">
            <h2 className="text-xl font-bold mb-4">Profile</h2>
            <form className="space-y-4" onSubmit={handleProfileSubmit} noValidate>
              <div>
                <label htmlFor="profile_photo_url" className="block mb-1 font-medium">
                  Photo URL
                </label>
                <input
                  type="url"
                  name="profile_photo_url"
                  id="profile_photo_url"
                  value={profileForm.profile_photo_url ?? ""}
                  onChange={handleProfileInputChange}
                  disabled={updateProfileMutation.isLoading}
                  className="w-full border rounded px-3 py-2"
                  autoComplete="off"
                  aria-describedby="profile-photo-desc"
                />
                <div id="profile-photo-desc" className="text-xs text-gray-500">
                  Paste in a direct image url (jpg/png).
                </div>
                {profileForm.profile_photo_url && (
                  <img
                    src={profileForm.profile_photo_url}
                    alt="Avatar preview"
                    className="w-16 h-16 rounded-full mt-2 object-cover"
                  />
                )}
              </div>
              <div>
                <label htmlFor="name" className="block mb-1 font-medium">
                  Name
                </label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  value={profileForm.name ?? ""}
                  onChange={handleProfileInputChange}
                  disabled={updateProfileMutation.isLoading}
                  className="w-full border rounded px-3 py-2"
                  required
                />
                {profileErrors.name && (
                  <div className="text-xs text-red-600" aria-live="polite">
                    {profileErrors.name}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="email" className="block mb-1 font-medium">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  value={profileForm.email ?? ""}
                  onChange={handleProfileInputChange}
                  disabled={updateProfileMutation.isLoading}
                  className="w-full border rounded px-3 py-2"
                  required
                />
                {profileErrors.email && (
                  <div className="text-xs text-red-600" aria-live="polite">{profileErrors.email}</div>
                )}
              </div>
              <div>
                <label htmlFor="contact_info" className="block mb-1 font-medium">
                  Contact Info
                </label>
                <input
                  type="text"
                  name="contact_info"
                  id="contact_info"
                  value={profileForm.contact_info ?? ""}
                  onChange={handleProfileInputChange}
                  disabled={updateProfileMutation.isLoading}
                  className="w-full border rounded px-3 py-2"
                />
                {profileErrors.contact_info && (
                  <div className="text-xs text-red-600" aria-live="polite">{profileErrors.contact_info}</div>
                )}
              </div>
              {profileErrors.global && (
                <div className="text-xs text-red-600" aria-live="polite">
                  {profileErrors.global}
                </div>
              )}
              <div className="flex gap-4 mt-5 items-center">
                <button
                  type="submit"
                  disabled={updateProfileMutation.isLoading}
                  className="px-4 py-2 rounded bg-primary-600 text-white font-semibold hover:bg-primary-700"
                  aria-label="Save Profile"
                >
                  {updateProfileMutation.isLoading ? "Saving…" : "Save Changes"}
                </button>
                {profileSuccess && (
                  <span className="text-green-700 text-sm" aria-live="polite">
                    {profileSuccess}
                  </span>
                )}
              </div>
            </form>
            <div className="mt-4 border-t pt-4">
              <h3 className="font-semibold mb-2">Want to become a host?</h3>
              <button
                className="px-4 py-2 bg-yellow-200 hover:bg-yellow-300 rounded font-bold text-yellow-900"
                aria-label="Switch to Host Mode"
                disabled={switchToHostMutation.isLoading || user?.role === "host"}
                onClick={() => switchToHostMutation.mutate()}
                tabIndex={0}
              >
                {switchToHostMutation.isLoading ? "Switching…" : "Switch To Host Dashboard"}
              </button>
              {user?.role === "host" && (
                <div className="mt-2 text-green-700 font-semibold">
                  You are now a host! Go to <Link to="/dashboard/host" className="underline text-primary-700">Host Dashboard &rarr;</Link>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  );
};

export default UV_GuestDashboard;