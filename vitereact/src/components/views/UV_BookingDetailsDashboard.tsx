import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

// Zod types from shared schema
import type { User, Booking, Review, Villa, VillaPhoto } from "@schema";
import { useAppStore } from "@/store/main";

// Helper: API root
const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

type LoaderState = { is_loading: boolean; context: string | null };
type ErrorState = { has_error: boolean; message: string | null; context: string | null };

// Util: Mask address for guests until booking is confirmed
function maskAddress(addr: string | null, status: string, role: string) {
  if (!addr) return "—";
  if (role === "host" || status === "confirmed") return addr;
  return "Full address shown after booking is confirmed.";
}

// HTTP header helper
function authHeaders(token: string | null) {
  return token
    ? {
        headers: { Authorization: `Bearer ${token}` }
      }
    : {};
}

// --- React Query Fetchers ---
const fetchBooking = async (
  booking_id: string,
  token: string | null
): Promise<Booking> => {
  const res = await axios.get(
    `${API_URL}/bookings/${encodeURIComponent(booking_id)}`,
    authHeaders(token)
  );
  return res.data;
};

const fetchVilla = async (villa_id: string, token: string | null): Promise<Villa> => {
  const res = await axios.get(
    `${API_URL}/villas/${encodeURIComponent(villa_id)}`,
    authHeaders(token)
  );
  return res.data;
};

const fetchVillaPhotos = async (villa_id: string, token: string | null): Promise<VillaPhoto[]> => {
  const res = await axios.get(
    `${API_URL}/villas/${encodeURIComponent(villa_id)}/photos?limit=1&offset=0`,
    authHeaders(token)
  );
  return Array.isArray(res.data) ? res.data : [];
};

const fetchUserProfile = async (user_id: string, token: string | null): Promise<User> => {
  const res = await axios.get(
    `${API_URL}/users/${encodeURIComponent(user_id)}`,
    authHeaders(token)
  );
  return res.data;
};

const fetchReview = async (
  booking_id: string,
  reviewer_user_id: string,
  token: string | null
): Promise<Review | null> => {
  const res = await axios.get(
    `${API_URL}/reviews?booking_id=${encodeURIComponent(
      booking_id
    )}&reviewer_user_id=${encodeURIComponent(reviewer_user_id)}`,
    authHeaders(token)
  );
  return Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
};

// --- Mutations ---
interface CancelBookingInput {
  booking_id: string;
  status: "cancelled";
  cancellation_reason: string;
}
const cancelBooking = async (
  input: CancelBookingInput,
  token: string | null
): Promise<Booking> => {
  const res = await axios.patch(
    `${API_URL}/bookings/${encodeURIComponent(input.booking_id)}`,
    {
      booking_id: input.booking_id,
      status: input.status,
      cancellation_reason: input.cancellation_reason ?? "",
    },
    authHeaders(token)
  );
  return res.data;
};

interface ApproveBookingInput {
  booking_id: string;
  status: "confirmed";
}
const approveBooking = async (
  input: ApproveBookingInput,
  token: string | null
): Promise<Booking> => {
  const res = await axios.patch(
    `${API_URL}/bookings/${encodeURIComponent(input.booking_id)}`,
    { booking_id: input.booking_id, status: input.status },
    authHeaders(token)
  );
  return res.data;
};

interface RejectBookingInput {
  booking_id: string;
  status: "rejected";
  cancellation_reason: string;
}
const rejectBooking = async (
  input: RejectBookingInput,
  token: string | null
): Promise<Booking> => {
  const res = await axios.patch(
    `${API_URL}/bookings/${encodeURIComponent(input.booking_id)}`,
    {
      booking_id: input.booking_id,
      status: input.status,
      cancellation_reason: input.cancellation_reason ?? "",
    },
    authHeaders(token)
  );
  return res.data;
};

interface WriteReviewInput {
  booking_id: string;
  villa_id: string;
  reviewer_user_id: string;
  reviewee_user_id: string;
  reviewer_role: string;
  rating: number;
  text: string | null;
}
const writeReview = async (
  input: WriteReviewInput,
  token: string | null
): Promise<Review> => {
  const res = await axios.post(
    `${API_URL}/reviews`,
    { ...input },
    authHeaders(token)
  );
  return res.data;
};

interface StartMessageThreadInput {
  booking_id: string;
  participant_user_ids: string; // comma separated
}
const startMessageThread = async (
  input: StartMessageThreadInput,
  token: string | null
) => {
  const res = await axios.post(
    `${API_URL}/message-threads`,
    {
      booking_id: input.booking_id,
      participant_user_ids: input.participant_user_ids,
    },
    authHeaders(token)
  );
  return res.data; // MessageThread
};

// ========================
//   Main Component
// ========================

const UV_BookingDetailsDashboard: React.FC = () => {
  const params = useParams<{ booking_id: string }>();
  const booking_id = params.booking_id?.trim() || "";

  // Global
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const set_loader_state = useAppStore((s) => s.set_loader_state);
  const reset_loader_state = useAppStore((s) => s.reset_loader_state);
  const set_error_state = useAppStore((s) => s.set_error_state);
  const reset_error_state = useAppStore((s) => s.reset_error_state);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewSubmitErr, setReviewSubmitErr] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- Fetch booking ---
  const {
    data: booking,
    isLoading: bookingLoading,
    error: bookingError,
    refetch: refetchBooking,
  } = useQuery<Booking, Error>(
    ["booking", booking_id],
    () => fetchBooking(booking_id, auth_token),
    {
      enabled: !!booking_id && !!auth_token,
      refetchOnWindowFocus: false,
      retry: false,
      onError: (e: any) => set_error_state({ message: e.message, context: "booking" }),
    }
  );

  // Who is viewing?
  const viewerRole = user?.role;
  const isGuestView = user && booking && user.user_id === booking.guest_user_id;
  const isHostView = user && booking && user.user_id === booking.host_user_id;
  const isAdminView = user && user.role === "admin";

  // --- Fetch villa ---
  const {
    data: villa,
    isLoading: villaLoading,
    error: villaError,
  } = useQuery<Villa, Error>(
    booking && booking.villa_id
      ? ["villa", booking.villa_id]
      : ["villa", ""],
    () => fetchVilla(booking!.villa_id, auth_token),
    {
      enabled: !!booking && !!auth_token,
      refetchOnWindowFocus: false,
      retry: false,
    }
  );

  // --- Fetch villa hero photo ---
  const {
    data: villaPhotos,
    isLoading: photoLoading,
    error: photoError,
  } = useQuery<VillaPhoto[], Error>(
    booking && booking.villa_id
      ? ["villa-photos", booking.villa_id]
      : ["villa-photos", ""],
    () => fetchVillaPhotos(booking!.villa_id, auth_token),
    {
      enabled: !!booking && !!auth_token,
      refetchOnWindowFocus: false,
      retry: false,
    }
  );

  // --- Fetch host or guest profile ---
  const {
    data: otherProfile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery<User, Error>(
    booking && user && viewerRole && (isGuestView || isHostView)
      ? [
          isGuestView ? "host-profile" : "guest-profile",
          isGuestView ? booking.host_user_id : booking.guest_user_id,
        ]
      : ["profile", ""],
    () =>
      fetchUserProfile(
        isGuestView ? booking!.host_user_id : booking!.guest_user_id,
        auth_token
      ),
    {
      enabled: !!user && !!booking && !!auth_token && (isHostView || isGuestView),
      refetchOnWindowFocus: false,
      retry: false,
    }
  );

  // --- Fetch review ---
  const {
    data: myReview,
    isLoading: reviewLoading,
    refetch: refetchReview,
  } = useQuery<Review | null, Error>(
    booking && user
      ? ["review", booking.booking_id, user.user_id]
      : ["review", ""],
    () => fetchReview(booking!.booking_id, user!.user_id, auth_token),
    {
      enabled: !!booking && !!user && !!auth_token,
      refetchOnWindowFocus: false,
      retry: false,
    }
  );

  // --- Mutations: Cancel Booking ---
  const cancelBookingMutation = useMutation<Booking, Error, CancelBookingInput>({
    mutationFn: (input) => cancelBooking(input, auth_token),
    onMutate: () => {
      set_loader_state({ is_loading: true, context: "cancel_booking" });
    },
    onSuccess: () => {
      reset_loader_state();
      setShowCancelModal(false);
      setCancelReason("");
      queryClient.invalidateQueries(["booking", booking_id]);
    },
    onError: (err: Error) => {
      set_loader_state({ is_loading: false, context: null });
      setActionError("Failed to cancel booking: " + (err.message ?? "Unknown error"));
    },
  });

  // --- Mutations: Approve Booking (host) ---
  const approveBookingMutation = useMutation<Booking, Error, ApproveBookingInput>({
    mutationFn: (input) => approveBooking(input, auth_token),
    onMutate: () => {
      set_loader_state({ is_loading: true, context: "approve_booking" });
    },
    onSuccess: () => {
      reset_loader_state();
      queryClient.invalidateQueries(["booking", booking_id]);
    },
    onError: (err: Error) => {
      set_loader_state({ is_loading: false, context: null });
      setActionError("Failed to approve booking: " + (err.message ?? "Unknown error"));
    },
  });

  // --- Mutations: Reject Booking (host) ---
  const rejectBookingMutation = useMutation<Booking, Error, RejectBookingInput>({
    mutationFn: (input) => rejectBooking(input, auth_token),
    onMutate: () => {
      set_loader_state({ is_loading: true, context: "reject_booking" });
    },
    onSuccess: () => {
      reset_loader_state();
      setShowRejectModal(false);
      setRejectReason("");
      queryClient.invalidateQueries(["booking", booking_id]);
    },
    onError: (err: Error) => {
      set_loader_state({ is_loading: false, context: null });
      setActionError("Failed to reject booking: " + (err.message ?? "Unknown error"));
    },
  });

  // --- Mutations: Write Review ---
  const writeReviewMutation = useMutation<Review, Error, WriteReviewInput>({
    mutationFn: (input) => writeReview(input, auth_token),
    onMutate: () => set_loader_state({ is_loading: true, context: "write_review" }),
    onSuccess: () => {
      reset_loader_state();
      setShowReviewModal(false);
      setReviewText("");
      setReviewRating(5);
      refetchReview();
      queryClient.invalidateQueries(["review", booking_id, user?.user_id]);
    },
    onError: (err: Error) => {
      set_loader_state({ is_loading: false, context: null });
      setReviewSubmitErr("Failed to submit review: " + (err.message ?? "Unknown error"));
    },
  });

  // --- Mutations: Start or Go to Message Thread (Contact) ---
  const messageThreadMutation = useMutation<any, Error, StartMessageThreadInput>({
    mutationFn: (input) => startMessageThread(input, auth_token),
    onSuccess: (thread) => {
      navigate(`/messages?thread_id=${encodeURIComponent(thread.thread_id)}`);
    },
    onError: (err: Error) => {
      setActionError("Failed to start message thread: " + (err.message ?? "Unknown error"));
    },
  });

  // --- Derived UI Vars ---
  const status = booking?.status;
  const bookingConfirmed = status === "confirmed";
  const bookingPending = status === "pending";
  const bookingCancelled = status === "cancelled";
  const bookingRejected = status === "rejected";
  const canCancel =
    booking &&
    ((isGuestView && (status === "pending" || status === "confirmed")) ||
      (isHostView && status === "confirmed"));
  const canApprove = isHostView && status === "pending";
  const canReject = isHostView && status === "pending";
  const canReview =
    booking &&
    ((isGuestView || isHostView) &&
      !myReview &&
      status === "confirmed" &&
      new Date(booking.end_date) < new Date());
  const canWriteReview =
    canReview && !reviewLoading && !myReview && !showReviewModal && !bookingCancelled && !bookingRejected;
  const canContact =
    otherProfile && ((isGuestView && status !== "cancelled") || (isHostView && status !== "cancelled"));

  // --- Modal Submit Handlers ---
  const confirmCancelBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      setActionError("Please provide a reason for cancellation.");
      return;
    }
    if (booking) {
      cancelBookingMutation.mutate({
        booking_id: booking.booking_id,
        status: "cancelled",
        cancellation_reason: cancelReason.trim() || "No reason specified",
      });
    }
  };

  const confirmRejectBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setActionError("Please provide a reason for rejection.");
      return;
    }
    if (booking) {
      rejectBookingMutation.mutate({
        booking_id: booking.booking_id,
        status: "rejected",
        cancellation_reason: rejectReason.trim(),
      });
    }
  };

  const submitReview = (e: React.FormEvent) => {
    e.preventDefault();
    setReviewSubmitErr(null);
    if (!reviewRating || reviewRating < 1 || reviewRating > 5) {
      setReviewSubmitErr("Rating must be between 1 and 5.");
      return;
    }
    if (!booking || !otherProfile || !user) return;
    writeReviewMutation.mutate({
      booking_id: booking.booking_id,
      villa_id: booking.villa_id,
      reviewer_user_id: user.user_id,
      reviewee_user_id: isGuestView
        ? booking.host_user_id
        : booking.guest_user_id,
      reviewer_role: user.role || "",
      rating: reviewRating,
      text: reviewText || null,
    });
  };

  // Keyboard closure
  useEffect(() => {
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCancelModal(false);
        setShowRejectModal(false);
        setShowReviewModal(false);
        setActionError(null);
        setReviewSubmitErr(null);
      }
    };
    window.addEventListener("keydown", escHandler);
    return () => window.removeEventListener("keydown", escHandler);
  }, []);

  // Reset error state on input change
  useEffect(() => {
    if (actionError) setActionError(null);
    // eslint-disable-next-line
  }, [cancelReason, rejectReason]);

  // Reset review error when inputs change
  useEffect(() => {
    if (reviewSubmitErr) setReviewSubmitErr(null);
    // eslint-disable-next-line
  }, [reviewText, reviewRating]);

  // Masked address
  const displayAddress = maskAddress(
    villa?.address || null,
    booking?.status || "",
    user?.role || ""
  );

  // Friendly date formatting
  function fmtDate(d: string | Date | null) {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  }

  // Helper: transaction/policy snippet
  function policySnippet(policy: string | undefined) {
    if (!policy) return null;
    if (policy.toLowerCase().includes("strict")) {
      return "Strict: No refund after 7 days prior.";
    }
    if (policy.toLowerCase().includes("moderate")) {
      return "Moderate: Partial refund up to 5 days prior.";
    }
    if (policy.toLowerCase().includes("flexible")) {
      return "Flexible: Full refund up to 2 days prior.";
    }
    return policy;
  }

  // Loading/error state (integrated)
  const isLoading =
    bookingLoading ||
    villaLoading ||
    photoLoading ||
    profileLoading ||
    reviewLoading ||
    cancelBookingMutation.isLoading ||
    approveBookingMutation.isLoading ||
    rejectBookingMutation.isLoading ||
    writeReviewMutation.isLoading;

  // Main render
  return (
    <>
      {/* Loader */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/80 z-40 flex items-center justify-center">
          <div role="status">
            <svg className="animate-spin h-10 w-10 text-blue-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 017.3-7.95V0C5.37 0 0 5.37 0 12h4z"/>
            </svg>
            <span className="sr-only">Loading...</span>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="w-full max-w-3xl mx-auto px-2 sm:px-4 py-6" aria-live="polite">
        {/* Back DASH link */}
        <div className="mb-4">
          <Link to={isHostView ? "/dashboard/host" : "/dashboard/guest"} className="text-blue-700 text-sm hover:underline">
            ← Back to Dashboard
          </Link>
        </div>

        {/* Error state */}
        {(bookingError || villaError || profileError || actionError) && (
          <div className="mb-4">
            <div className="bg-red-100 border border-red-300 rounded px-4 py-3 text-red-700" role="alert" aria-live="polite">
              <strong>Error:</strong>{" "}
              {bookingError?.message ||
                villaError?.message ||
                profileError?.message ||
                actionError ||
                "Sorry, something went wrong."}
            </div>
          </div>
        )}

        {/* Booking summary card */}
        <section className="bg-white shadow rounded-md mb-6">
          <div className="flex flex-col sm:flex-row">
            <div className="sm:w-48 w-full h-32 sm:h-48 rounded-t-md sm:rounded-t-none sm:rounded-l-md overflow-hidden flex-shrink-0">
              {villaPhotos && villaPhotos[0] && villaPhotos[0].url ? (
                <img
                  src={villaPhotos[0].url}
                  alt="Villa photo"
                  className="object-cover w-full h-full"
                  draggable={false}
                />
              ) : (
                <img
                  src={`https://picsum.photos/seed/${villa?.villa_id || "villa"}/300/200`}
                  alt="Villa"
                  className="object-cover w-full h-full"
                  draggable={false}
                />
              )}
            </div>
            <div className="flex-1 p-4">
              <div className="flex flex-row items-center justify-between space-y-0">
                <h2 className="font-bold text-lg truncate" title={villa?.name || "Villa"}>
                  {villa?.name || "Villa"}
                </h2>
                <span
                  className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                    bookingConfirmed
                      ? "bg-green-100 text-green-700"
                      : bookingPending
                      ? "bg-yellow-100 text-yellow-800"
                      : bookingCancelled
                      ? "bg-gray-100 text-gray-500"
                      : bookingRejected
                      ? "bg-red-100 text-red-600"
                      : "bg-blue-100 text-blue-700"
                  }`}
                  aria-label={`Booking status: ${status || ""}`}
                >
                  {(status || "").toUpperCase()}
                </span>
              </div>
              <div className="text-gray-500 text-xs mt-1">
                <span className="mr-2">
                  Booking #: <span className="font-semibold">{booking?.booking_id}</span>
                </span>
                <span>
                  Booked: {booking ? fmtDate(booking.created_at) : ""}
                </span>
              </div>
              <div className="my-2 text-sm">
                {villa?.subtitle && (
                  <div className="italic text-gray-700">{villa.subtitle}</div>
                )}
                <div className="flex flex-wrap text-gray-700">
                  <span className="mr-2">{villa?.location}</span>
                  <span className="mr-2">
                    {'•'} {fmtDate(booking?.start_date)} to {fmtDate(booking?.end_date)}
                  </span>
                  <span className="mr-2">
                    {'•'} {booking?.adults} adults
                  </span>
                  {booking && booking.children > 0 && (
                    <span className="mr-2">{booking.children} children</span>
                  )}
                  {booking && booking.infants > 0 && (
                    <span className="mr-2">{booking.infants} infants</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center">
                  <span className="font-medium mr-2">
                    Total: ${booking?.total_price?.toLocaleString() ?? "—"}
                  </span>
                  <span className="text-xs text-gray-500">
                    <span className="mr-2">
                      (incl. Cleaning: ${booking?.cleaning_fee}, Service: ${booking?.service_fee})
                    </span>
                  </span>
                </div>
                <div className="mt-2 text-gray-600" aria-label="Address">
                  <span className="font-semibold">Address:</span>{" "}
                  {displayAddress}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {villa?.cancellation_policy && (
                    <>Cancellation: <span>{policySnippet(villa.cancellation_policy)}</span></>
                  )}
                </div>
                {booking?.cancellation_reason && (
                  <div className="mt-1 text-xs text-red-500">
                    Reason: {booking.cancellation_reason}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Other party card */}
        <section className="bg-gray-50 rounded-md p-4 mb-6 flex flex-col sm:flex-row items-center">
          {otherProfile ? (
            <>
              <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-200 flex-shrink-0 mb-2 sm:mb-0 sm:mr-4">
                <img
                  src={
                    otherProfile.profile_photo_url ||
                    `https://picsum.photos/seed/${otherProfile.user_id}/100/100`
                  }
                  alt="User avatar"
                  className="object-cover w-full h-full"
                />
              </div>
              <div className="flex-1">
                <div className="font-bold text-gray-800 text-lg">
                  {isGuestView ? "Host:" : "Guest:"}{" "}
                  {otherProfile.name}
                </div>
                {otherProfile.contact_info && typeof otherProfile.contact_info === "string" && (
                  <div className="text-gray-700 text-xs mt-1">Contact: {otherProfile.contact_info}</div>
                )}
                {isGuestView && otherProfile.host_bio && (
                  <div className="italic text-gray-400 text-xs mt-1">{otherProfile.host_bio}</div>
                )}
              </div>
              {canContact && (
                <button
                  type="button"
                  aria-label={`Contact ${isGuestView ? "host" : "guest"}`}
                  className="px-4 py-2 rounded bg-blue-600 text-white shadow hover:bg-blue-700 focus:outline-none focus:ring mt-2 sm:mt-0 sm:ml-4"
                  onClick={() => {
                    // Open (or create) message thread for booking/guest/host
                    const participant_user_ids = `${user!.user_id},${otherProfile.user_id}`;
                    messageThreadMutation.mutate({
                      booking_id: booking!.booking_id,
                      participant_user_ids,
                    });
                  }}
                  tabIndex={0}
                >
                  Message {isGuestView ? "Host" : "Guest"}
                </button>
              )}
            </>
          ) : (
            <div className="text-gray-400 text-xs">User details loading…</div>
          )}
        </section>

        {/* Host Actions if host */}
        {isHostView && (
          <section className="mb-6 flex flex-row space-x-2">
            {canApprove && (
              <button
                aria-label="Approve booking"
                className="px-4 py-2 rounded bg-green-600 text-white shadow hover:bg-green-700 focus:outline-none focus:ring"
                onClick={() => {
                  if (booking) {
                    approveBookingMutation.mutate({
                      booking_id: booking.booking_id,
                      status: "confirmed",
                    });
                  }
                }}
                disabled={approveBookingMutation.isLoading}
                tabIndex={0}
              >
                Approve
              </button>
            )}
            {canReject && (
              <button
                aria-label="Reject booking"
                className="px-4 py-2 rounded bg-red-600 text-white shadow hover:bg-red-700 focus:outline-none focus:ring"
                onClick={() => setShowRejectModal(true)}
                disabled={rejectBookingMutation.isLoading}
                tabIndex={0}
              >
                Reject
              </button>
            )}
            {canCancel && (
              <button
                aria-label="Cancel booking"
                className="px-4 py-2 rounded bg-gray-700 text-white shadow hover:bg-gray-900 focus:outline-none focus:ring"
                onClick={() => setShowCancelModal(true)}
                disabled={cancelBookingMutation.isLoading}
                tabIndex={0}
              >
                Cancel
              </button>
            )}
          </section>
        )}

        {/* Guest cancel CTA */}
        {isGuestView && canCancel && (
          <section className="mb-6">
            <button
              aria-label="Cancel booking"
              className="px-4 py-2 rounded bg-gray-700 text-white shadow hover:bg-gray-900 focus:outline-none focus:ring"
              onClick={() => setShowCancelModal(true)}
              disabled={cancelBookingMutation.isLoading}
              tabIndex={0}
            >
              Cancel Booking
            </button>
          </section>
        )}

        {/* Review block */}
        <section className="mb-6 bg-white rounded-md shadow-sm p-4">
          <div className="font-semibold mb-2 text-gray-800">
            {myReview && myReview.review_id
              ? "Your Review"
              : canWriteReview
              ? "Leave a Review"
              : "Review"}
          </div>
          {myReview && myReview.review_id ? (
            <div className="text-gray-700">
              <div className="flex items-center mb-1">
                {Array(myReview.rating)
                  .fill(null)
                  .map((_, i) => (
                    <span key={i} aria-label="star" className="text-yellow-400">&#9733;</span>
                  ))}
                {Array(5 - myReview.rating)
                  .fill(null)
                  .map((_, i) => (
                    <span key={i} aria-label="empty-star" className="text-gray-300">&#9733;</span>
                  ))}
                <span className="ml-2 text-xs text-gray-400">{fmtDate(myReview.created_at)}</span>
              </div>
              {myReview.text && (
                <div className="text-sm text-gray-700 italic">{myReview.text}</div>
              )}
              {/* If still within 24h of creation, could allow edit (not implemented here) */}
              <Link
                to={`/reviews?booking_id=${encodeURIComponent(
                  booking_id
                )}`}
                className="inline-block mt-2 text-blue-700 text-xs hover:underline"
              >
                View in Reviews
              </Link>
            </div>
          ) : canWriteReview ? (
            <>
              <button
                aria-label="Write review"
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring"
                onClick={() => setShowReviewModal(true)}
                tabIndex={0}
              >
                Write Review
              </button>
              {showReviewModal && (
                <div
                  className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center"
                  aria-modal="true"
                  role="dialog"
                >
                  <form
                    className="bg-white rounded-md shadow p-6 w-full max-w-md"
                    onSubmit={submitReview}
                  >
                    <div className="mb-2 font-bold text-gray-800">Leave a Review</div>
                    <label className="block text-sm mb-2" htmlFor="rating">
                      Rating:
                    </label>
                    <div className="flex mb-3" id="rating">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                          className={star <= reviewRating ? "text-yellow-400 text-2xl" : "text-gray-300 text-2xl"}
                          onClick={() => setReviewRating(star)}
                          tabIndex={0}
                        >
                          &#9733;
                        </button>
                      ))}
                    </div>
                    <label className="block text-sm mb-2" htmlFor="review-text">
                      Review:
                    </label>
                    <textarea
                      id="review-text"
                      minLength={6}
                      maxLength={3000}
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value.slice(0, 3000))}
                      className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
                      rows={3}
                      required
                      tabIndex={0}
                    />
                    {reviewSubmitErr && (
                      <div className="text-red-500 mb-2" aria-live="polite">
                        {reviewSubmitErr}
                      </div>
                    )}
                    <div className="flex flex-row justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowReviewModal(false)}
                        className="px-3 py-1 rounded border border-gray-400 text-gray-700 hover:bg-gray-200"
                        aria-label="Cancel review"
                        tabIndex={0}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                        tabIndex={0}
                      >
                        Submit
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          ) : (
            <span className="text-gray-400 text-sm">No review yet.</span>
          )}
        </section>

        {/* Cancel booking modal */}
        {showCancelModal && (
          <div
            className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
            aria-modal="true"
            role="dialog"
          >
            <form
              className="bg-white rounded shadow-xl p-6 w-full max-w-md"
              onSubmit={confirmCancelBooking}
            >
              <div className="font-bold mb-2 text-gray-800">Cancel booking</div>
              <p>
                Please provide a reason for cancellation (required, will be shared with the other party):
              </p>
              <textarea
                className="w-full border border-gray-300 rounded px-2 py-1 mt-2"
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value.slice(0, 300));
                  setActionError(null);
                }}
                maxLength={300}
                minLength={5}
                required
                aria-label="Cancellation reason"
                tabIndex={0}
              />
              {actionError && (
                <div className="text-red-500 mt-1" aria-live="polite">{actionError}</div>
              )}
              <div className="mt-4 flex flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-3 py-1 rounded border border-gray-400 text-gray-700 hover:bg-gray-200"
                  tabIndex={0}
                  aria-label="Close modal"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-1 rounded bg-gray-700 text-white hover:bg-gray-900"
                  tabIndex={0}
                  aria-label="Submit cancellation"
                >
                  Confirm Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Reject booking modal (host only) */}
        {showRejectModal && (
          <div
            className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
            aria-modal="true"
            role="dialog"
          >
            <form
              className="bg-white rounded shadow-xl p-6 w-full max-w-md"
              onSubmit={confirmRejectBooking}
            >
              <div className="font-bold mb-2 text-gray-800">Reject booking</div>
              <p>
                Please provide a reason for rejection (required, will be shared with the guest):
              </p>
              <textarea
                className="w-full border border-gray-300 rounded px-2 py-1 mt-2"
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value.slice(0, 300));
                  setActionError(null);
                }}
                maxLength={300}
                minLength={5}
                required
                aria-label="Rejection reason"
                tabIndex={0}
              />
              {actionError && (
                <div className="text-red-500 mt-1" aria-live="polite">{actionError}</div>
              )}
              <div className="mt-4 flex flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-3 py-1 rounded border border-gray-400 text-gray-700 hover:bg-gray-200"
                  tabIndex={0}
                  aria-label="Close modal"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-1 rounded bg-red-700 text-white hover:bg-red-900"
                  tabIndex={0}
                  aria-label="Confirm rejection"
                >
                  Confirm Reject
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </>
  );
};

export default UV_BookingDetailsDashboard;