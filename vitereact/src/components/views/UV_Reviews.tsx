import React from "react";
import { useLocation, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
import { z } from "zod";

// Import exact Zod types (simulate import as @schema for correct types)
import {
  reviewSchema,
  createReviewInputSchema,
  updateReviewInputSchema,
} from "@/schema"; // For static type safety only. You'll need a real path with Zod schemas.

type Review = z.infer<typeof reviewSchema>;
type CreateReviewInput = z.infer<typeof createReviewInputSchema>;
type UpdateReviewInput = z.infer<typeof updateReviewInputSchema>;

function getApiBase() {
  return import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
}

// Helpers
function formatDate(dt: string | Date) {
  const d = typeof dt === "string" ? new Date(dt) : dt;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function timeLeftToEdit(can_edit_until: string | null) {
  if (!can_edit_until) return null;
  const remaining = new Date(can_edit_until).getTime() - Date.now();
  if (remaining <= 0) return null;
  const minutes = Math.floor(remaining / 60000);
  if (minutes > 60)
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m left to edit`;
  return `${minutes}min left to edit`;
}

const UV_Reviews: React.FC = () => {
  // Zustand selectors
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const loader_state = useAppStore((s) => s.loader_state);
  const set_loader_state = useAppStore((s) => s.set_loader_state);
  const reset_loader_state = useAppStore((s) => s.reset_loader_state);
  const set_error_state = useAppStore((s) => s.set_error_state);
  const reset_error_state = useAppStore((s) => s.reset_error_state);

  // URL params (villa_id, booking_id)
  const [searchParams] = useSearchParams();
  const villa_id = searchParams.get("villa_id");
  const booking_id = searchParams.get("booking_id");

  // Review list query key
  const reviewQueryKey = [
    "reviews",
    { villa_id, booking_id, reviewer_user_id: user?.user_id },
  ];

  // Local state for modal/dialogs and editing/writing reviews
  const [writeMode, setWriteMode] = React.useState<boolean>(
    !!booking_id // if booking context, force write mode
  );
  // Active review for edit/delete forms
  const [activeReview, setActiveReview] = React.useState<Review | null>(null);

  // Pagination/sorting
  const [sortBy, setSortBy] = React.useState<"created_at" | "rating">("created_at");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [limit, setLimit] = React.useState<number>(20);
  const [offset, setOffset] = React.useState<number>(0);

  // Error/notification local states for this view
  const [formError, setFormError] = React.useState<string | null>(null);
  const [formSuccess, setFormSuccess] = React.useState<string | null>(null);

  // Controlled form state for writing/editing a review (default if composing new)
  const [form, setForm] = React.useState<{
    booking_id: string | null;
    villa_id: string | null;
    reviewer_user_id: string;
    reviewee_user_id: string;
    reviewer_role: string;
    rating: number;
    text: string;
  } | null>(null);

  // Pull user role (for new review) and basic info
  const reviewerUserId = user?.user_id ?? "";
  const reviewerRole = user?.role ?? "";

  // QueryClient
  const queryClient = useQueryClient();

  // ----- FETCH REVIEWS -----
  const {
    data: reviews,
    isLoading: isReviewsLoading,
    isError: isReviewsError,
    refetch: refetchReviews,
  } = useQuery<Review[], Error>({
    queryKey: reviewQueryKey,
    queryFn: async () => {
      // Build params
      const params: Record<string, string> = {};
      if (villa_id) params.villa_id = villa_id;
      if (booking_id) params.booking_id = booking_id;
      // For "My Reviews" context, fetch reviews by me
      if (!villa_id && user?.user_id) params.reviewer_user_id = user.user_id;
      // Sorting and pagination:
      params.limit = String(limit);
      params.offset = String(offset);
      params.sort_by = sortBy;
      params.sort_order = sortOrder;
      const res = await axios.get(`${getApiBase()}/reviews`, {
        params,
        headers: auth_token
          ? {
              Authorization: `Bearer ${auth_token}`,
            }
          : undefined,
      });
      return res.data;
    },
    enabled: true, // Always fetch on mount & param change
    refetchOnMount: true,
    retry: 1,
    onError: (err) => {
      set_error_state({
        has_error: true,
        message: (err as any)?.message ?? "Failed to fetch reviews.",
        context: "reviews_fetch",
      });
    },
  });

  // ----- CREATE/UPDATE/DELETE MUTATION CONFIG -----

  // SUBMIT (CREATE) REVIEW
  const reviewSubmitMutation = useMutation<
    Review,
    Error,
    CreateReviewInput,
    unknown
  >({
    mutationFn: async (input: CreateReviewInput) => {
      reset_error_state();
      set_loader_state({ is_loading: true, context: "review_submit" });
      const res = await axios.post(
        `${getApiBase()}/reviews`,
        input,
        {
          headers: auth_token
            ? { Authorization: `Bearer ${auth_token}` }
            : undefined,
        }
      );
      return res.data;
    },
    onSuccess: (review) => {
      setFormSuccess("Review submitted!");
      setFormError(null);
      setWriteMode(false);
      setForm(null);
      refetchReviews();
      set_loader_state({ is_loading: false, context: null });
    },
    onError: (error) => {
      setFormError(error.message || "Review submission failed.");
      set_loader_state({ is_loading: false, context: null });
      set_error_state({
        has_error: true,
        message: error.message,
        context: "review_submit",
      });
    },
  });

  // UPDATE/EDIT REVIEW MUTATION
  const reviewEditMutation = useMutation<
    Review,
    Error,
    UpdateReviewInput,
    unknown
  >({
    mutationFn: async (input: UpdateReviewInput) => {
      reset_error_state();
      set_loader_state({ is_loading: true, context: "review_edit" });
      const res = await axios.patch(
        `${getApiBase()}/reviews/${input.review_id}`,
        input,
        {
          headers: auth_token
            ? { Authorization: `Bearer ${auth_token}` }
            : undefined,
        }
      );
      return res.data;
    },
    onSuccess: (review) => {
      setFormSuccess("Review updated.");
      setFormError(null);
      setActiveReview(null);
      setWriteMode(false);
      setForm(null);
      refetchReviews();
      set_loader_state({ is_loading: false, context: null });
    },
    onError: (error) => {
      setFormError(error.message || "Review update failed.");
      set_loader_state({ is_loading: false, context: null });
      set_error_state({
        has_error: true,
        message: error.message,
        context: "review_edit",
      });
    },
  });

  // DELETE (SOFT) REVIEW MUTATION
  const reviewDeleteMutation = useMutation<
    Review,
    Error,
    UpdateReviewInput,
    unknown
  >({
    mutationFn: async (input: UpdateReviewInput) => {
      reset_error_state();
      set_loader_state({ is_loading: true, context: "review_delete" });
      const res = await axios.patch(
        `${getApiBase()}/reviews/${input.review_id}`,
        { ...input, is_deleted: true },
        {
          headers: auth_token
            ? { Authorization: `Bearer ${auth_token}` }
            : undefined,
        }
      );
      return res.data;
    },
    onSuccess: () => {
      setFormSuccess("Review deleted.");
      setFormError(null);
      setActiveReview(null);
      setWriteMode(false);
      setForm(null);
      refetchReviews();
      set_loader_state({ is_loading: false, context: null });
    },
    onError: (error) => {
      setFormError(error.message || "Delete failed.");
      set_loader_state({ is_loading: false, context: null });
    },
  });

  // --------------- FORM EFFECTS ---------------

  // If landing with a booking_id and user is logged in, write mode AND auto-fill form if no existing review
  React.useEffect(() => {
    if (booking_id && user) {
      // See if review by me for this booking already exists
      const existing = (reviews || []).find(
        (r) =>
          r.booking_id === booking_id &&
          r.reviewer_user_id === user.user_id &&
          !r.is_deleted
      );
      if (!existing) {
        // For writing new review: need to get reviewee_user_id (host or guest)
        // This is only possible if reviewee_user_id is known—would require more data (from booking), so fallback to empty string
        setForm({
          booking_id,
          villa_id: villa_id ?? "",
          reviewer_user_id: user.user_id,
          reviewee_user_id: "", // unknown (ideally would be provided/queried)
          reviewer_role: user.role ?? "",
          rating: 5,
          text: "",
        });
        setWriteMode(true);
      } else {
        // Already reviewed, no write form
        setWriteMode(false);
      }
    }
  }, [booking_id, user, reviews, villa_id]);

  // Handler: start edit mode for a review (user's own, within edit window)
  const onStartEdit = (review: Review) => {
    setActiveReview(review);
    setWriteMode(true);
    setForm({
      booking_id: review.booking_id,
      villa_id: review.villa_id,
      reviewer_user_id: review.reviewer_user_id,
      reviewee_user_id: review.reviewee_user_id ?? "",
      reviewer_role: review.reviewer_role,
      rating: review.rating,
      text: review.text || "",
    });
    setFormError(null);
    setFormSuccess(null);
  };

  // Handler: start delete mode for a review (user's own, within edit window)
  const onDelete = (review: Review) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this review? This cannot be undone."
      )
    )
      return;
    reviewDeleteMutation.mutate({ review_id: review.review_id });
  };

  // Handler: cancel form editing/writing
  const onCancelForm = () => {
    setActiveReview(null);
    setWriteMode(false);
    setForm(null);
    setFormError(null);
    setFormSuccess(null);
  };

  // Handler: submit (create/edit) review
  const onSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!user || !form) {
      setFormError("You must be logged in to submit a review.");
      return;
    }
    // Validate rating
    if (form.rating < 1 || form.rating > 5) {
      setFormError("Please give a rating from 1 to 5.");
      return;
    }
    // Compose input as per API contract
    if (activeReview && activeReview.review_id && activeReview.can_edit_until) {
      // Edit/patch
      // Only allowed before can_edit_until
      if (new Date(activeReview.can_edit_until).getTime() < Date.now()) {
        setFormError("Review can no longer be edited.");
        return;
      }
      reviewEditMutation.mutate({
        review_id: activeReview.review_id,
        rating: form.rating,
        text: form.text,
      });
    } else {
      // New review (must have booking_id, villa_id, reviewer_user_id, reviewee_user_id, reviewer_role)
      // NOTE: reviewee_user_id is left as "" since we have no means to get it here without another query;
      // ideally, it would be inferred from the booking context (host_user_id for guest->host, guest_user_id for host->guest).
      // If reviewee_user_id is required and missing, block submission:
      if (!form.booking_id || !form.villa_id || !form.reviewee_user_id) {
        setFormError(
          "Missing required booking, villa, or reviewer fields. (Sorry! Try reviewing from your dashboard or booking detail page.)"
        );
        return;
      }
      reviewSubmitMutation.mutate({
        booking_id: form.booking_id,
        villa_id: form.villa_id,
        reviewer_user_id: form.reviewer_user_id,
        reviewee_user_id: form.reviewee_user_id,
        reviewer_role: form.reviewer_role,
        rating: form.rating,
        text: form.text,
      });
    }
  };

  // Handler: handle input changes on form (star, text)
  const onUpdateForm = (field: string, value: any) => {
    setFormError(null);
    setForm((prev) =>
      prev
        ? {
            ...prev,
            [field]: field === "rating" ? Math.max(1, Math.min(5, Number(value))) : value,
          }
        : prev
    );
  };

  // Pagination controls
  const canPrev = offset > 0;
  const canNext = (reviews?.length ?? 0) === limit;
  const handlePrev = () => {
    setOffset((o) => Math.max(0, o - limit));
  };
  const handleNext = () => {
    setOffset((o) => o + limit);
  };

  // -------------- RENDER ---------------

  return (
    <>
      {/* Header/toolbar */}
      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reviews & Feedback</h1>
          <p className="text-sm text-gray-600">
            {villa_id
              ? "Showing reviews for this villa."
              : user
                ? "Your reviews & experiences. View, edit, or remove your feedbacks."
                : "View public guest and host reviews for CliffBnb villas."}
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <button
            className="rounded px-3 py-2 bg-gray-100 hover:bg-gray-200 text-sm transition"
            onClick={() => {
              setSortBy(sortBy === "created_at" ? "rating" : "created_at");
              setOffset(0);
            }}
          >
            Sort by:{" "}
            <span className="font-semibold">
              {sortBy === "created_at" ? "Newest" : "Rating"}
            </span>
          </button>
          <button
            className="rounded px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 text-sm transition"
            onClick={() => {
              setOffset(0);
              refetchReviews();
            }}
          >
            Refresh
          </button>
          {/* Compose button, only if logged in and not in booking context, and not already writing */}
          {user && !writeMode && !booking_id && (
            <button
              className="rounded px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
              onClick={() => {
                setActiveReview(null);
                setForm({
                  booking_id: "",
                  villa_id: villa_id ?? "",
                  reviewer_user_id: user.user_id,
                  reviewee_user_id: "",
                  reviewer_role: user.role || "",
                  rating: 5,
                  text: "",
                });
                setWriteMode(true);
              }}
            >
              Write a Review
            </button>
          )}
        </div>
      </div>

      {/* Submission success notification */}
      {formSuccess && (
        <div
          className="max-w-2xl mx-auto my-4 rounded bg-green-50 border border-green-200 text-green-800 px-4 py-3"
          aria-live="polite"
        >
          {formSuccess}
          <button
            tabIndex={0}
            className="ml-4 text-green-700 underline"
            onClick={() => setFormSuccess(null)}
            aria-label="Close notification"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Compose or edit a review */}
      {(writeMode || !!form) && form && (
        <div className="max-w-2xl mx-auto mt-6 rounded shadow bg-white border p-6 mb-8" tabIndex={-1}>
          <form onSubmit={onSubmitForm} className="flex flex-col gap-4" autoComplete="off">
            <h2 className="font-semibold text-lg mb-2">
              {activeReview ? "Edit Review" : "Write a Review"}
            </h2>
            {/* Rating (stars) */}
            <div>
              <label htmlFor="rating" className="block font-medium text-gray-700 mb-1">
                Rating
              </label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    tabIndex={0}
                    aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                    className={`text-2xl cursor-pointer transition ${
                      form.rating >= star ? "text-yellow-400" : "text-gray-300"
                    }`}
                    onClick={() => onUpdateForm("rating", star)}
                  >
                    ★
                  </button>
                ))}
                <span className="ml-3 text-sm text-gray-500">{form.rating}/5</span>
              </div>
            </div>
            {/* Text */}
            <div>
              <label htmlFor="text" className="block font-medium text-gray-700 mb-1">
                Your review
              </label>
              <textarea
                id="text"
                value={form.text}
                onChange={e => {
                  setFormError(null);
                  setForm(f => f ? { ...f, text: e.target.value } : f);
                }}
                rows={4}
                className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                maxLength={3000}
                placeholder="Share your detailed experience (max 3000 chars)..."
              />
            </div>
            {/* Form error */}
            {formError && (
              <div className="text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2" aria-live="polite">
                {formError}
              </div>
            )}
            {/* Submission controls */}
            <div className="flex items-center gap-4 mt-2">
              <button
                type="submit"
                className={`bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 font-semibold transition ${
                  loader_state.is_loading ? "opacity-60 cursor-not-allowed" : ""
                }`}
                disabled={loader_state.is_loading}
                aria-disabled={loader_state.is_loading}
              >
                {activeReview ? "Save Changes" : "Submit Review"}
              </button>
              <button
                type="button"
                className="rounded px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700"
                onClick={onCancelForm}
                tabIndex={0}
              >
                Cancel
              </button>
              {activeReview?.can_edit_until && (
                <span className="ml-2 text-xs text-gray-400">
                  {timeLeftToEdit(activeReview.can_edit_until)}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* List of reviews */}
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-2 flex justify-between items-end gap-2">
          <div>
            <h2 className="text-lg font-semibold mt-2">
              {reviews?.length ? `${reviews.length} Review${reviews.length === 1 ? "" : "s"}` : "No reviews yet"}
            </h2>
          </div>
        </div>
        {isReviewsLoading && (
          <div className="py-12 text-center text-lg text-gray-600">
            Loading reviews...
          </div>
        )}
        {isReviewsError && (
          <div className="py-6 text-center text-red-700" aria-live="polite">
            Could not load reviews.{" "}
            <button
              className="underline text-blue-700"
              onClick={() => {
                setOffset(0);
                refetchReviews();
              }}
              tabIndex={0}
            >
              Retry
            </button>
          </div>
        )}
        {!isReviewsLoading && !reviews?.length && (
          <div className="py-12 text-center text-gray-500">
            No reviews found.<br />
            {user && !writeMode && !booking_id && (
              <button
                onClick={() => {
                  setActiveReview(null);
                  setWriteMode(true);
                  setForm({
                    booking_id: "",
                    villa_id: villa_id ?? "",
                    reviewer_user_id: user.user_id,
                    reviewee_user_id: "",
                    reviewer_role: user.role || "",
                    rating: 5,
                    text: "",
                  });
                }}
                className="underline text-blue-700 mt-2"
                tabIndex={0}
              >
                Be the first to leave a review!
              </button>
            )}
          </div>
        )}

        {reviews && reviews.length > 0 && (
          <ul className="divide-y border rounded bg-white mt-4">
            {reviews.filter(r => !r.is_deleted).map((review) => {
              const canEdit =
                user &&
                review.reviewer_user_id === user.user_id &&
                review.can_edit_until &&
                new Date(review.can_edit_until).getTime() > Date.now();
              return (
                <li key={review.review_id} className="p-5 flex flex-col sm:flex-row gap-4 sm:gap-8 group">
                  <div className="flex-shrink-0">
                    <div className="flex items-center gap-2">
                      {/* Profile avatar */}
                      <img
                        src={
                          review.reviewer_user_id === user?.user_id && user.profile_photo_url
                            ? user.profile_photo_url
                            : `https://picsum.photos/seed/${review.reviewer_user_id}/48/48`
                        }
                        alt="Reviewer Avatar"
                        className="h-10 w-10 rounded-full border object-cover"
                      />
                      <span className="text-gray-700 font-semibold text-base truncate">
                        {review.reviewer_user_id === user?.user_id
                          ? "You"
                          : review.reviewer_user_id}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{formatDate(review.created_at)}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex gap-1 items-center mb-0.5">
                      {/* Rating as filled stars */}
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={`text-xl ${i < review.rating ? "text-yellow-400" : "text-gray-300"}`}
                          aria-hidden="true"
                        >
                          ★
                        </span>
                      ))}
                      <span className="ml-2 text-sm text-gray-500">
                        {review.rating}/5
                      </span>
                    </div>
                    <div className="text-gray-800 text-base my-1 break-words">
                      {review.text || <span className="italic text-gray-400">No text provided.</span>}
                    </div>
                    {/* Actions for reviewer within edit window */}
                    {canEdit && (
                      <div className="flex gap-4 mt-2">
                        <button
                          onClick={() => onStartEdit(review)}
                          className="text-blue-700 underline text-sm"
                          tabIndex={0}
                          aria-label="Edit review"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(review)}
                          className="text-red-600 underline text-sm"
                          tabIndex={0}
                          aria-label="Delete review"
                        >
                          Delete
                        </button>
                        <span className="ml-2 text-xs text-gray-500 pt-1">{timeLeftToEdit(review.can_edit_until)}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-2 sm:mt-0">
                    {/* Booking/villa ref link, if exists */}
                    {review.villa_id && (
                      <Link
                        to={`/villa/${review.villa_id}`}
                        className="text-blue-600 underline"
                        tabIndex={0}
                        aria-label="Go to listing"
                      >
                        View listing
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Pagination controls */}
        {(canPrev || canNext) && (
          <div className="my-6 flex justify-center gap-8 items-center">
            <button
              onClick={handlePrev}
              disabled={!canPrev}
              className={`rounded px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium ${
                !canPrev ? "opacity-50 cursor-not-allowed" : ""
              }`}
              aria-disabled={!canPrev}
              tabIndex={0}
            >
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={!canNext}
              className={`rounded px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium ${
                !canNext ? "opacity-50 cursor-not-allowed" : ""
              }`}
              aria-disabled={!canNext}
              tabIndex={0}
            >
              Next
            </button>
          </div>
        )}

        {/* Back to villa/booking/dashboard links */}
        <div className="flex flex-wrap gap-4 mt-8 pb-10">
          {villa_id && (
            <Link
              to={`/villa/${villa_id}`}
              className="underline text-blue-700 hover:text-blue-900"
              aria-label="Back to listing"
              tabIndex={0}
            >
              ← Back to villa listing
            </Link>
          )}
          {user && (
            <Link
              to={user.role === "host" ? "/dashboard/host" : "/dashboard/guest"}
              className="underline text-blue-700 hover:text-blue-900"
              aria-label="Back to dashboard"
              tabIndex={0}
            >
              ← Back to dashboard
            </Link>
          )}
        </div>
      </div>
    </>
  );
};

export default UV_Reviews;