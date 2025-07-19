import React from "react";
import { useSearchParams, useNavigate, useParams, Link } from "react-router-dom";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

// Import Zustand store hook (for global state)
import { useAppStore } from "@/store/main";

// ---- Zod-derived types (keep all string IDs, snake_case)
import {
  userSchema,
  villaSchema,
  bookingSchema,
  reviewSchema,
  adminEmailLogSchema,
} from "@schema";

// Types for view state
type User = z.infer<typeof userSchema>;
type Villa = z.infer<typeof villaSchema>;
type Booking = z.infer<typeof bookingSchema>;
type Review = z.infer<typeof reviewSchema>;
type AdminEmailLog = z.infer<typeof adminEmailLogSchema>;

// -- Available Section Tabs -- (order matches UX)
const ADMIN_SECTIONS = [
  { key: "listings", label: "Listings" },
  { key: "users", label: "Users" },
  { key: "bookings", label: "Bookings" },
  { key: "reviews", label: "Reviews" },
  { key: "emails", label: "Email Logs" },
] as const;
type AdminSectionKey = typeof ADMIN_SECTIONS[number]["key"];

//---- API UTILS ----
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Helper: Axios with Authorization
const axiosAdmin = (token: string | null) =>
  axios.create({
    baseURL: API_BASE,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    validateStatus: x => x < 500,
  });

// ---- DATA FETCH FNS per resource ---

// List villas/listings
const fetchListings = async (token: string | null): Promise<Villa[]> => {
  const { data, status } = await axiosAdmin(token).get<Villa[]>(
    `/villas?limit=50&offset=0`
  );
  if (status !== 200) throw new Error("Failed to fetch listings");
  // Zod parse data
  return z.array(villaSchema).parse(data);
};

// List users
const fetchUsers = async (token: string | null): Promise<User[]> => {
  const { data, status } = await axiosAdmin(token).get<User[]>(
    `/users?limit=50&offset=0`
  );
  if (status !== 200) throw new Error("Failed to fetch users");
  return z.array(userSchema).parse(data);
};

// List bookings
const fetchBookings = async (token: string | null): Promise<Booking[]> => {
  const { data, status } = await axiosAdmin(token).get<Booking[]>(
    `/bookings?limit=50&offset=0`
  );
  if (status !== 200) throw new Error("Failed to fetch bookings");
  return z.array(bookingSchema).parse(data);
};

// List reviews
const fetchReviews = async (token: string | null): Promise<Review[]> => {
  const { data, status } = await axiosAdmin(token).get<Review[]>(
    `/reviews?limit=50&offset=0`
  );
  if (status !== 200) throw new Error("Failed to fetch reviews");
  return z.array(reviewSchema).parse(data);
};

// List emails
const fetchEmailLogs = async (token: string | null): Promise<AdminEmailLog[]> => {
  const { data, status } = await axiosAdmin(token).get<AdminEmailLog[]>(
    `/admin-email-logs?limit=50&offset=0`
  );
  if (status !== 200) throw new Error("Failed to fetch email logs");
  return z.array(adminEmailLogSchema).parse(data);
};

// ---- MUTATION FNS ----

// Unpublish listing (PATCH)
const unpublishListing = async ({
  token,
  villa_id,
}: { token: string | null; villa_id: string }) => {
  const { status } = await axiosAdmin(token).patch(`/villas/${villa_id}`, {
    villa_id,
    status: "unpublished",
  });
  if (status !== 200) throw new Error("Failed to unpublish listing");
  return { villa_id, status: "unpublished" };
};

// Suspend user (PATCH)
const suspendUser = async ({
  token,
  user_id,
}: { token: string | null; user_id: string }) => {
  const { status } = await axiosAdmin(token).patch(`/users/${user_id}`, {
    user_id,
    role: "suspended",
  });
  if (status !== 200) throw new Error("Failed to suspend user");
  return { user_id, role: "suspended" };
};

// Cancel booking (PATCH)
const cancelBooking = async ({
  token,
  booking_id,
}: { token: string | null; booking_id: string }) => {
  const { status } = await axiosAdmin(token).patch(`/bookings/${booking_id}`, {
    booking_id,
    status: "cancelled",
  });
  if (status !== 200) throw new Error("Failed to cancel booking");
  return { booking_id, status: "cancelled" };
};

// Delete review (DELETE)
const deleteReview = async ({
  token,
  review_id,
}: { token: string | null; review_id: string }) => {
  const { status } = await axiosAdmin(token).delete(`/reviews/${review_id}`);
  if (status !== 204) throw new Error("Failed to delete review");
  return { review_id };
};

// ---- COMPONENT ----

const UV_AdminDashboard: React.FC = () => {
  // Zustand: get user, token, loader/error actions
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const loader_state = useAppStore((s) => s.loader_state);
  const error_state = useAppStore((s) => s.error_state);
  const set_loader_state = useAppStore((s) => s.set_loader_state);
  const reset_loader_state = useAppStore((s) => s.reset_loader_state);
  const set_error_state = useAppStore((s) => s.set_error_state);
  const reset_error_state = useAppStore((s) => s.reset_error_state);

  // --- Routing/section logic ---
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = React.useState<AdminSectionKey>(
    (section && ADMIN_SECTIONS.some(s => s.key === section) ? section : "listings") as AdminSectionKey
  );

  // Keep section in sync with URL
  React.useEffect(() => {
    if (section !== activeSection) {
      // If route changes, update local
      if (section && ADMIN_SECTIONS.some(s => s.key === section)) {
        setActiveSection(section as AdminSectionKey);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // On tab click, update URL
  const handleSectionSwitch = (key: AdminSectionKey) => {
    if (key !== activeSection) {
      setActiveSection(key);
      navigate(key === "listings" ? "/admin" : `/admin/${key}`);
    }
  };

  // --- Admin access-guard ---
  React.useEffect(() => {
    if (user?.role !== "admin") {
      // If not admin, force redirect to /admin/login
      navigate("/admin/login", { replace: true });
    }
  }, [user, navigate]);

  // --- Data fetch per section (react-query) ---
  const queryClient = useQueryClient();

  // Listings
  const {
    data: listings,
    isLoading: listingsLoading,
    isError: listingsError,
    error: listingsErrorObj,
    refetch: refetchListings,
  } = useQuery<Villa[], Error>({
    queryKey: ["admin", "listings"],
    queryFn: () => fetchListings(auth_token),
    enabled: activeSection === "listings" && user?.role === "admin",
  });

  // Users
  const {
    data: users,
    isLoading: usersLoading,
    isError: usersError,
    error: usersErrorObj,
    refetch: refetchUsers,
  } = useQuery<User[], Error>({
    queryKey: ["admin", "users"],
    queryFn: () => fetchUsers(auth_token),
    enabled: activeSection === "users" && user?.role === "admin",
  });

  // Bookings
  const {
    data: bookings,
    isLoading: bookingsLoading,
    isError: bookingsError,
    error: bookingsErrorObj,
    refetch: refetchBookings,
  } = useQuery<Booking[], Error>({
    queryKey: ["admin", "bookings"],
    queryFn: () => fetchBookings(auth_token),
    enabled: activeSection === "bookings" && user?.role === "admin",
  });

  // Reviews
  const {
    data: reviews,
    isLoading: reviewsLoading,
    isError: reviewsError,
    error: reviewsErrorObj,
    refetch: refetchReviews,
  } = useQuery<Review[], Error>({
    queryKey: ["admin", "reviews"],
    queryFn: () => fetchReviews(auth_token),
    enabled: activeSection === "reviews" && user?.role === "admin",
  });

  // Email Logs
  const {
    data: emails,
    isLoading: emailsLoading,
    isError: emailsError,
    error: emailsErrorObj,
    refetch: refetchEmails,
  } = useQuery<AdminEmailLog[], Error>({
    queryKey: ["admin", "emails"],
    queryFn: () => fetchEmailLogs(auth_token),
    enabled: activeSection === "emails" && user?.role === "admin",
  });

  // --- Moderation Mutations ---
  // Listings
  const unpublishListingMutation = useMutation<
    any,
    Error,
    { villa_id: string }
  >({
    mutationFn: async ({ villa_id }) =>
      unpublishListing({ token: auth_token, villa_id }),
    onMutate: () => set_loader_state({ is_loading: true, context: "unpublishing" }),
    onSuccess: () => {
      reset_loader_state();
      refetchListings();
    },
    onError: (error: Error) => {
      reset_loader_state();
      set_error_state({ message: error.message, context: "unpublishing" });
    },
  });

  // Users
  const suspendUserMutation = useMutation<
    any,
    Error,
    { user_id: string }
  >({
    mutationFn: async ({ user_id }) => suspendUser({ token: auth_token, user_id }),
    onMutate: () => set_loader_state({ is_loading: true, context: "suspending" }),
    onSuccess: () => {
      reset_loader_state();
      refetchUsers();
    },
    onError: (error: Error) => {
      reset_loader_state();
      set_error_state({ message: error.message, context: "suspending" });
    },
  });

  // Bookings
  const cancelBookingMutation = useMutation<
    any,
    Error,
    { booking_id: string }
  >({
    mutationFn: async ({ booking_id }) => cancelBooking({ token: auth_token, booking_id }),
    onMutate: () => set_loader_state({ is_loading: true, context: "cancelling" }),
    onSuccess: () => {
      reset_loader_state();
      refetchBookings();
    },
    onError: (error: Error) => {
      reset_loader_state();
      set_error_state({ message: error.message, context: "cancelling" });
    },
  });

  // Reviews
  const deleteReviewMutation = useMutation<
    any,
    Error,
    { review_id: string }
  >({
    mutationFn: async ({ review_id }) => deleteReview({ token: auth_token, review_id }),
    onMutate: () => set_loader_state({ is_loading: true, context: "deleting-review" }),
    onSuccess: () => {
      reset_loader_state();
      refetchReviews();
    },
    onError: (error: Error) => {
      reset_loader_state();
      set_error_state({ message: error.message, context: "deleting-review" });
    },
  });

  // --- Keyboard navigation for tabs ---
  const tabListRef = React.useRef<HTMLDivElement>(null);

  // --- Focus highlight for tab changes
  React.useEffect(() => {
    if (tabListRef.current) {
      const activeButton: HTMLElement | null = tabListRef.current.querySelector(
        "button[aria-selected='true']"
      );
      if (activeButton) activeButton.focus();
    }
  }, [activeSection]);

  // --- Table Scroll/Focus for accessibility on section change
  const tableWrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (tableWrapRef.current) {
      tableWrapRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeSection]);

  // --- Dismiss error when switching sections/inputs
  React.useEffect(() => {
    if (error_state.has_error) {
      reset_error_state();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  // Loader combined for the right section
  const isAnyLoading =
    loader_state.is_loading ||
    listingsLoading ||
    usersLoading ||
    bookingsLoading ||
    reviewsLoading ||
    emailsLoading;

  // Helper: Empty data display
  const renderEmptyRow = (message: string) => (
    <tr>
      <td colSpan={24} className="text-center py-8 text-gray-400">
        {message}
      </td>
    </tr>
  );

  // Helper: Error banner (inline)
  const renderInlineError = (msg: string) => (
    <div className="bg-red-50 text-red-700 border border-red-300 rounded px-4 py-2 my-2" role="alert" aria-live="polite">
      {msg}
    </div>
  );

  // ------------- RENDER -------------
  // --
  return (
    <>
      {/* PAGE: Admin Panel */}
      <main className="min-h-screen bg-gray-50 text-gray-800">
        {/* Admin nav bar */}
        <nav
          className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm"
          aria-label="Admin Navigation"
        >
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
            <div className="font-bold text-lg tracking-wide text-blue-900">
              CliffBnb Admin Console
            </div>
            <div className="flex gap-4 items-center">
              <span className="hidden sm:inline-block text-gray-600 font-medium">
                {user?.name} ({user?.email})
              </span>
              <Link
                to="/"
                className="text-blue-600 hover:underline px-3 py-2 text-sm font-medium rounded"
                tabIndex={0}
              >
                Back to Main Site
              </Link>
            </div>
          </div>
        </nav>
        {/* Tab/sidebar navigation */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div
            className="max-w-6xl mx-auto flex flex-row md:flex-row items-center gap-3 overflow-x-auto"
            ref={tabListRef}
            role="tablist"
            aria-label="Admin Console Sections"
          >
            {ADMIN_SECTIONS.map((section) => (
              <button
                key={section.key}
                className={`min-w-[110px] px-4 py-3 font-semibold border-b-2 transition
                  ${activeSection === section.key
                    ? "border-blue-600 text-blue-700 bg-blue-50"
                    : "border-transparent text-gray-700 hover:bg-gray-100"
                  }`}
                aria-current={activeSection === section.key ? "page" : undefined}
                aria-selected={activeSection === section.key}
                tabIndex={0}
                onClick={() => handleSectionSwitch(section.key)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    // Next/prev tab
                    const curIdx = ADMIN_SECTIONS.findIndex(t => t.key === activeSection);
                    let newIdx = e.key === "ArrowRight"
                      ? (curIdx + 1) % ADMIN_SECTIONS.length
                      : (curIdx - 1 + ADMIN_SECTIONS.length) % ADMIN_SECTIONS.length;
                    handleSectionSwitch(ADMIN_SECTIONS[newIdx].key);
                  }
                }}
                role="tab"
                id={`tab-${section.key}`}
                aria-controls={`tabpanel-${section.key}`}
                style={{ outline: "none" }}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
        {/* --- Core Content Area --- */}
        <div className="max-w-6xl mx-auto px-3 py-8" ref={tableWrapRef}>
          {/* Loader Overlay */}
          {isAnyLoading &&
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-20">
              <svg className="h-10 w-10 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24" aria-label="Loading">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="ml-3 text-blue-800 font-semibold">Loading...</span>
            </div>
          }
          {/* Error Banner (aria-live) */}
          {(error_state.has_error || listingsError || usersError || bookingsError || reviewsError || emailsError) && (
            <div
              className="mb-6 mt-1"
              aria-live="polite"
              tabIndex={-1}
            >
              {error_state.has_error && renderInlineError(error_state.message!)}
              {listingsError && activeSection === "listings" && renderInlineError(listingsErrorObj?.message || "Failed to load listings.")}
              {usersError && activeSection === "users" && renderInlineError(usersErrorObj?.message || "Failed to load users.")}
              {bookingsError && activeSection === "bookings" && renderInlineError(bookingsErrorObj?.message || "Failed to load bookings.")}
              {reviewsError && activeSection === "reviews" && renderInlineError(reviewsErrorObj?.message || "Failed to load reviews.")}
              {emailsError && activeSection === "emails" && renderInlineError(emailsErrorObj?.message || "Failed to load email logs.")}
            </div>
          )}
          {/* Content: Table Per Section */}
          {activeSection === "listings" && (
            <div
              id="tabpanel-listings"
              role="tabpanel"
              aria-labelledby="tab-listings"
              className="overflow-x-auto relative"
            >
              <table className="min-w-full text-sm rounded shadow" role="table">
                <thead className="bg-blue-50 border-b font-semibold">
                  <tr role="row">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Host</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listings && listings.length > 0 ? listings.map((v) => (
                    <tr key={v.villa_id} role="row" className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">
                        <Link
                          to={`/villa/${v.villa_id}`}
                          className="text-blue-700 underline"
                          tabIndex={0}
                          aria-label={`Preview listing ${v.name}`}
                        >
                          {v.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{v.location}</td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/dashboard/host`}
                          className="text-blue-600 underline"
                          tabIndex={0}
                          aria-label={`Go to host's dashboard`}
                        >
                          {v.host_user_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-1 rounded-full text-xs font-medium
                            ${v.status === "published"
                              ? "bg-green-100 text-green-800"
                              : v.status === "unpublished"
                                ? "bg-yellow-100 text-yellow-900"
                                : "bg-gray-100 text-gray-900"
                            }`
                          }
                        >
                          {v.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {new Date(v.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 space-x-2">
                        {v.status === "published" ? (
                          <button
                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition"
                            aria-label={`Unpublish listing ${v.name}`}
                            disabled={unpublishListingMutation.isPending}
                            onClick={() => unpublishListingMutation.mutate({ villa_id: v.villa_id })}
                          >
                            Unpublish
                          </button>
                        ) : (
                          <span className="inline-block text-gray-400 text-xs">Unpublished</span>
                        )}
                      </td>
                    </tr>
                  )) : renderEmptyRow("No villa listings found.")}
                </tbody>
              </table>
            </div>
          )}
          {activeSection === "users" && (
            <div
              id="tabpanel-users"
              role="tabpanel"
              aria-labelledby="tab-users"
              className="overflow-x-auto relative"
            >
              <table className="min-w-full text-sm rounded shadow" role="table">
                <thead className="bg-blue-50 border-b font-semibold">
                  <tr role="row">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Email Confirmed</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users && users.length > 0 ? users.map((u) => (
                    <tr key={u.user_id} role="row" className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">
                        <span>{u.name}</span>
                      </td>
                      <td className="px-3 py-2">{u.email}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-1 rounded-full text-xs bg-gray-50 border">{u.role}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {u.is_email_confirmed ? (
                          <span className="text-green-600 font-medium">Yes</span>
                        ) : (
                          <span className="text-red-600">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : ""}
                      </td>
                      <td className="px-3 py-2 space-x-2">
                        {u.role !== "suspended" ? (
                          <button
                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-yellow-800 bg-yellow-100 border border-yellow-200 rounded hover:bg-yellow-200 transition"
                            aria-label={`Suspend user ${u.name}`}
                            disabled={suspendUserMutation.isPending}
                            onClick={() => suspendUserMutation.mutate({ user_id: u.user_id })}
                          >
                            Suspend
                          </button>
                        ) : (
                          <span className="inline-block text-gray-400 text-xs">Suspended</span>
                        )}
                      </td>
                    </tr>
                  )) : renderEmptyRow("No users found.")}
                </tbody>
              </table>
            </div>
          )}
          {activeSection === "bookings" && (
            <div
              id="tabpanel-bookings"
              role="tabpanel"
              aria-labelledby="tab-bookings"
              className="overflow-x-auto relative"
            >
              <table className="min-w-full text-sm rounded shadow" role="table">
                <thead className="bg-blue-50 border-b font-semibold">
                  <tr role="row">
                    <th className="px-3 py-2">Booking ID</th>
                    <th className="px-3 py-2">Villa ID</th>
                    <th className="px-3 py-2">Guest</th>
                    <th className="px-3 py-2">Host</th>
                    <th className="px-3 py-2">Dates</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings && bookings.length > 0 ? bookings.map((b) => (
                    <tr key={b.booking_id} role="row" className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link to={`/booking/${b.booking_id}`}
                          className="text-blue-700 underline"
                          aria-label={`View booking ${b.booking_id}`}
                        >
                          {b.booking_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link to={`/villa/${b.villa_id}`}
                          className="text-blue-700 underline"
                          aria-label={`Go to villa ${b.villa_id}`}
                        >
                          {b.villa_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-blue-900">{b.guest_user_id}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-blue-900">{b.host_user_id}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {b.start_date && b.end_date
                          ? `${b.start_date} → ${b.end_date}`
                          : ""}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium
                          ${b.status === "confirmed"
                            ? "bg-green-100 text-green-800"
                            : b.status === "cancelled"
                              ? "bg-red-100 text-red-800"
                              : b.status === "pending"
                                ? "bg-yellow-200 text-yellow-900"
                                : "bg-gray-100 text-gray-900"
                          }`
                        }>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 space-x-2">
                        {b.status !== "cancelled" ? (
                          <button
                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition"
                            aria-label={`Cancel booking ${b.booking_id}`}
                            disabled={cancelBookingMutation.isPending}
                            onClick={() => cancelBookingMutation.mutate({ booking_id: b.booking_id })}
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="inline-block text-gray-400 text-xs">Cancelled</span>
                        )}
                      </td>
                    </tr>
                  )) : renderEmptyRow("No bookings found.")}
                </tbody>
              </table>
            </div>
          )}
          {activeSection === "reviews" && (
            <div
              id="tabpanel-reviews"
              role="tabpanel"
              aria-labelledby="tab-reviews"
              className="overflow-x-auto relative"
            >
              <table className="min-w-full text-sm rounded shadow" role="table">
                <thead className="bg-blue-50 border-b font-semibold">
                  <tr role="row">
                    <th className="px-3 py-2">Rating</th>
                    <th className="px-3 py-2">Text</th>
                    <th className="px-3 py-2">Reviewer</th>
                    <th className="px-3 py-2">Reviewee</th>
                    <th className="px-3 py-2">Villa</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews && reviews.length > 0 ? reviews.map((r) => (
                    <tr key={r.review_id} role="row" className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-1 rounded bg-gray-200 text-gray-900 font-semibold text-xs mr-1">
                          {r.rating}
                        </span>
                        <span className="sr-only">stars</span>
                      </td>
                      <td className="px-3 py-2 max-w-sm truncate" title={r.text ?? ""}>
                        {r.text ?? <span className="text-gray-400">No text</span>}
                      </td>
                      <td className="px-3 py-2">{r.reviewer_user_id}</td>
                      <td className="px-3 py-2">{r.reviewee_user_id}</td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/villa/${r.villa_id}`}
                          className="text-blue-700 underline"
                          aria-label={`Go to villa ${r.villa_id}`}
                        >
                          {r.villa_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                      </td>
                      <td className="px-3 py-2 space-x-2">
                        {!r.is_deleted ? (
                          <button
                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition"
                            aria-label={`Delete review ${r.review_id}`}
                            disabled={deleteReviewMutation.isPending}
                            onClick={() => deleteReviewMutation.mutate({ review_id: r.review_id })}
                          >
                            Delete
                          </button>
                        ) : (
                          <span className="inline-block text-gray-400 text-xs">Deleted</span>
                        )}
                      </td>
                    </tr>
                  )) : renderEmptyRow("No reviews found.")}
                </tbody>
              </table>
            </div>
          )}
          {activeSection === "emails" && (
            <div
              id="tabpanel-emails"
              role="tabpanel"
              aria-labelledby="tab-emails"
              className="overflow-x-auto relative"
            >
              <table className="min-w-full text-sm rounded shadow" role="table">
                <thead className="bg-blue-50 border-b font-semibold">
                  <tr role="row">
                    <th className="px-3 py-2">To / User</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Sent At</th>
                    <th className="px-3 py-2">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {emails && emails.length > 0 ? emails.map((e) => (
                    <tr key={e.log_id} role="row" className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">
                        {e.user_id && <span className="inline-block text-xs text-gray-500 mr-2">({e.user_id})</span>}
                        <span>{e.to_email}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-1 rounded-full text-xs bg-gray-50 border">{e.type}</span>
                      </td>
                      <td className="px-3 py-2">{e.subject}</td>
                      <td className="px-3 py-2">
                        {e.sent_at ? new Date(e.sent_at).toLocaleString() : ""}
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate" title={e.content}>
                        {e.content.length > 120
                          ? e.content.slice(0, 120) + "..."
                          : e.content}
                      </td>
                    </tr>
                  )) : renderEmptyRow("No email log entries found.")}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default UV_AdminDashboard;