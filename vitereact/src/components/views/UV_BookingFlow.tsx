import React, { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";

// Import types from shared Zod schemas
import {
  villaSchema,
  createBookingInputSchema,
  type Villa,
  type User,
  type Booking,
} from "@schema";

// Zustand global state store
import { useAppStore } from "@/store/main";

// API base URL (MUST use the VITE_ prefix)
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// --- Step Form state ---
type BookingFormState = {
  start_date: string | null;
  end_date: string | null;
  adults: number;
  children: number;
  infants: number;
  is_guest_id_provided: boolean;
};

type PriceBreakdown = {
  nights: number;
  price_per_night: number;
  cleaning_fee: number;
  service_fee: number;
  subtotal: number;
  total_price: number;
};

// --- Main Component ---
const UV_BookingFlow: React.FC = () => {
  // ---- ROUTE, STORE, NAV ----
  const { villa_id } = useParams<{ villa_id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Global state: user/auth (always up-to-date, never object pattern)
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);

  // Email confirmation flag
  const is_email_confirmed = !!user?.is_email_confirmed;

  // ---- STEP state ----
  const [step, setStep] = useState<number>(0);

  // Show confirmation prompt if user tries to cancel/leave in steps 0-2
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);

  // --- Booking form state (correct Zod field names) ---
  // On mount, extract prefill values from URL
  const [form, setForm] = useState<BookingFormState>({
    start_date: searchParams.get("start_date") || null,
    end_date: searchParams.get("end_date") || null,
    adults: parseInt(searchParams.get("adults") || "1", 10) || 1,
    children: parseInt(searchParams.get("children") || "0", 10) || 0,
    infants: parseInt(searchParams.get("infants") || "0", 10) || 0,
    is_guest_id_provided: false,
  });

  // Payment state
  const [payment, setPayment] = useState<{
    card_number: string;
    name_on_card: string;
    expiry: string;
    cvc: string;
  }>({
    card_number: "",
    name_on_card: "",
    expiry: "",
    cvc: "",
  });

  // Error state (per-step)
  const [stepError, setStepError] = useState<string | null>(null);

  // Booking confirmation state/result
  const [bookingResult, setBookingResult] = useState<Booking | null>(null);

  // ---- Focus management (for accessibility) ----
  const stepTitleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Set focus to step title on every step change
    if (stepTitleRef.current) stepTitleRef.current.focus();
  }, [step]);

  // ---- Fetch VILLA DETAIL (react-query) ----
  const villaQuery = useQuery<Villa, Error>({
    queryKey: ["villa-detail", villa_id],
    queryFn: async () => {
      if (!villa_id) throw new Error("Missing villa_id");
      const { data } = await axios.get(
        `${API_BASE_URL}/villas/${encodeURIComponent(villa_id)}`
      );
      // Type safety: zod validation at runtime too
      return villaSchema.parse(data);
    },
    enabled: !!villa_id,
    retry: 1,
  });

  const villa = villaQuery.data;
  const villaLoading = villaQuery.isLoading;
  const villaError = villaQuery.error;

  // ---- Price breakdown derived state ----
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown>({
    nights: 0,
    price_per_night: 0,
    cleaning_fee: 0,
    service_fee: 0,
    subtotal: 0,
    total_price: 0,
  });

  // --- Price breakdown calculation effect ---
  useEffect(() => {
    if (!villa || !form.start_date || !form.end_date) {
      setPriceBreakdown({
        nights: 0,
        price_per_night: villa?.price_per_night || 0,
        cleaning_fee: villa?.cleaning_fee || 0,
        service_fee: villa?.service_fee || 0,
        subtotal: 0,
        total_price: 0,
      });
      return;
    }
    const start = new Date(form.start_date);
    const end = new Date(form.end_date);
    // Ensure dates valid + end > start
    let nights = 0;
    if (end > start) {
      nights = Math.floor(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );
    }
    // Stay policy: minimum_stay_nights
    if (villa.minimum_stay_nights && nights < villa.minimum_stay_nights) {
      // Not valid, but don't block here (frontend can show warning in UI)
    }

    const price_per_night = villa.price_per_night || 0;
    const cleaning_fee = villa.cleaning_fee || 0;
    const service_fee = villa.service_fee || 0;
    const subtotal = nights * price_per_night;
    const total = subtotal + cleaning_fee + service_fee;

    setPriceBreakdown({
      nights,
      price_per_night,
      cleaning_fee,
      service_fee,
      subtotal,
      total_price: total,
    });
  }, [form.start_date, form.end_date, villa]);

  // UI: track if submit in progress (local, not global spinner)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // --- Booking submission (step 3) ---
  const bookingMutation = useMutation<
    Booking,
    Error,
    z.infer<typeof createBookingInputSchema>
  >({
    mutationFn: async (input) => {
      if (!auth_token)
        throw new Error(
          "You must be logged in to complete a booking. Please log in."
        );
      const { data } = await axios.post(
        `${API_BASE_URL}/bookings`,
        input,
        {
          headers: {
            Authorization: `Bearer ${auth_token}`,
          },
        }
      );
      return data as Booking;
    },
    onSuccess: (booking) => {
      setBookingResult(booking);
      setStep(3); // Step 4: confirmation
      setIsSubmitting(false);
    },
    onError: (error: Error) => {
      setIsSubmitting(false);
      setStepError(
        error?.message ||
          "An error occurred during booking. Please try again."
      );
    },
  });

  // --- Step-wise validation ---
  function validateStep(currentStep: number): boolean {
    setStepError(null);
    if (currentStep === 0) {
      // Must have filled: dates, nights >= min, guests > 0, villa exists
      if (!form.start_date || !form.end_date) {
        setStepError("Please select both start and end dates for your stay.");
        return false;
      }
      if (!villa) {
        setStepError("Villa information could not be loaded.");
        return false;
      }
      if (priceBreakdown.nights < (villa.minimum_stay_nights || 1)) {
        setStepError(
          `Stay must be at least ${villa.minimum_stay_nights || 1} nights.`
        );
        return false;
      }
      if ((form.adults || 0) < 1) {
        setStepError("At least one adult guest is required.");
        return false;
      }
      // All checks pass
      return true;
    } else if (currentStep === 1) {
      // Must have user, and checked ID, and email confirmed
      if (!user) {
        setStepError(
          "You must be logged in to complete your booking. Please log in."
        );
        return false;
      }
      if (!form.is_guest_id_provided) {
        setStepError(
          "You must confirm you have provided your identity (MVP checkbox)."
        );
        return false;
      }
      if (!user.is_email_confirmed) {
        setStepError(
          "You must confirm your email before booking. Please check your inbox."
        );
        return false;
      }
      return true;
    } else if (currentStep === 2) {
      // Payment form must be filled in correct format
      if (
        !payment.card_number ||
        !/^(\d{16})$/.test(payment.card_number.replace(/\s/g, ""))
      ) {
        setStepError(
          "Enter a valid 16-digit card number (numbers only, test any fake)."
        );
        return false;
      }
      if (!payment.expiry || !/^\d{2}\/\d{2}$/.test(payment.expiry)) {
        setStepError("Enter expiry date in MM/YY format.");
        return false;
      }
      if (!payment.cvc || !/^\d{3,4}$/.test(payment.cvc)) {
        setStepError("Enter a 3- or 4-digit security code (CVC).");
        return false;
      }
      if (!payment.name_on_card.trim()) {
        setStepError("Cardholder name is required.");
        return false;
      }
      return true;
    }
    return true;
  }

  // --- Reset form on mount/bookingResult ---
  useEffect(() => {
    if (bookingResult) {
      setForm({
        start_date: null,
        end_date: null,
        adults: 1,
        children: 0,
        infants: 0,
        is_guest_id_provided: false,
      });
      setPayment({
        card_number: "",
        name_on_card: "",
        expiry: "",
        cvc: "",
      });
    }
  }, [bookingResult]);

  // --- Handler for Next button ---
  function handleNext() {
    if (validateStep(step)) {
      setStep((prev) => prev + 1);
    }
  }
  // --- Handler for Back button ---
  function handleBack() {
    if (step === 0) {
      setShowCancelPrompt(true);
    } else if (step > 0) {
      setStep((prev) => prev - 1);
      setStepError(null);
    }
  }

  // --- Handler for cancel flow (confirmation) ---
  function handleCancel() {
    setShowCancelPrompt(false);
    navigate(`/villa/${villa_id}`);
  }

  // --- Handler for payment/booking submit ---
  function handleBookingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStepError(null);
    if (!validateStep(2)) return;
    // Final payload
    if (
      !villa ||
      !user ||
      !form.start_date ||
      !form.end_date ||
      !priceBreakdown.total_price
    ) {
      setStepError(
        "Missing information for booking. Check your details and try again."
      );
      return;
    }
    setIsSubmitting(true);
    bookingMutation.mutate({
      villa_id: villa.villa_id,
      guest_user_id: user.user_id,
      host_user_id: villa.host_user_id,
      start_date: form.start_date,
      end_date: form.end_date,
      adults: form.adults,
      children: form.children,
      infants: form.infants,
      total_price: priceBreakdown.total_price,
      cleaning_fee: priceBreakdown.cleaning_fee,
      service_fee: priceBreakdown.service_fee,
      status: "pending",
      payment_status: "pending",
      is_guest_id_provided: form.is_guest_id_provided,
    });
  }

  // --- Handler for any input changes (clears errors) ---
  function handleInputChange<K extends keyof BookingFormState>(
    key: K,
    value: BookingFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setStepError(null);
  }

  // ---- Sanitize: Ensure ONLY logged-in, email-confirmed users can book; otherwise, guard at App level or on step 2
  // But do NOT block UI here (handled by route guards and step validation).

  // ---- Loader/disabled state logic ----
  const isStepLocked =
    villaLoading || isSubmitting || bookingMutation.isPending;

  // ---- House rules + cancellation snippet
  function getCancellationSnippet(): string {
    if (!villa?.cancellation_policy) return "";
    const text = villa.cancellation_policy.toString();
    if (text.length > 110) return text.slice(0, 110).trimEnd() + "…";
    return text;
  }

  // --- RENDER ---
  return (
    <>
      {/* Cancel/close overlay */}
      {showCancelPrompt && (
        <div className="fixed z-50 inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-2 text-gray-800" tabIndex={-1}>
              Cancel Booking?
            </h2>
            <p className="mb-4">Your booking is not completed and will be lost if you leave.</p>
            <div className="flex space-x-4 justify-end">
              <button
                type="button"
                className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                onClick={() => setShowCancelPrompt(false)}
              >
                Continue Booking
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Main booking card */}
      <section
        className="flex flex-col items-center min-h-[80vh] py-6 bg-gray-50 relative"
        aria-live="polite"
      >
        <div className="w-full max-w-lg rounded-xl shadow-lg p-6 bg-white mt-6 border">
          {/* STEP TITLE */}
          <h1
            ref={stepTitleRef}
            tabIndex={-1}
            className="text-2xl font-bold mb-1 text-gray-800 outline-none"
          >
            {step === 0 && "1. Confirm Your Booking"}
            {step === 1 && "2. Guest Details & ID Confirmation"}
            {step === 2 && "3. Payment"}
            {step === 3 && "Booking Confirmed!"}
          </h1>
          {/* SUBTITLE */}
          <div className="mb-4">
            {step === 0 && (
              <>
                <p className="text-lg font-medium text-blue-700">
                  Review your stay details and price
                </p>
              </>
            )}
            {step === 1 && (
              <>
                <p>
                  Please confirm your contact info and check identity. You must agree to house rules and cancellation policy before continuing.
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <p>
                  Enter your payment information (simulated for demo/MVP).
                </p>
              </>
            )}
            {step === 3 && (
              <>
                <p>
                  Thank you for booking! Your stay is confirmed&mdash;see all details below.
                </p>
              </>
            )}
          </div>
          {/* Error block */}
          {stepError && (
            <div
              className="bg-red-100 border border-red-400 text-red-800 px-3 py-2 rounded mb-4"
              aria-live="polite"
              tabIndex={-1}
            >
              {stepError}
            </div>
          )}
          {/* Step Content */}
          {/* Step 0: Booking summary */}
          {step === 0 && (
            <>
              {/* Villa Info */}
              {villaLoading && (
                <div className="flex items-center justify-center min-h-[80px]">
                  <span className="animate-spin inline-block w-6 h-6 border-t-2 border-blue-600 rounded-full mr-2" />
                  Loading villa info…
                </div>
              )}
              {villaError && (
                <div className="text-red-600 text-sm">
                  Error loading villa info: {villaError.message}
                </div>
              )}
              {villa && (
                <div className="flex flex-col w-full space-y-4">
                  <div className="flex space-x-3 items-center">
                    <img
                      src={`https://picsum.photos/seed/${villa.villa_id}/90/90`}
                      alt="Villa preview"
                      className="rounded-lg w-24 h-24 object-cover border"
                    />
                    <div>
                      <div className="font-semibold text-gray-700 text-lg">{villa.name}</div>
                      <div className="text-gray-500 text-sm">{villa.location}</div>
                    </div>
                  </div>
                  {/* Dates+guests */}
                  <div className="flex flex-col mt-2">
                    <label className="font-medium text-sm text-gray-700 mb-1">Stay Dates</label>
                    <div className="flex space-x-2">
                      <input
                        type="date"
                        className="border rounded px-2 py-1"
                        value={form.start_date || ""}
                        onChange={e => handleInputChange("start_date", e.target.value)}
                        min={new Date().toISOString().slice(0, 10)}
                        required
                        aria-label="Start date"
                        disabled={villaLoading}
                      />
                      <span className="text-gray-400 mx-2">→</span>
                      <input
                        type="date"
                        className="border rounded px-2 py-1"
                        value={form.end_date || ""}
                        onChange={e => handleInputChange("end_date", e.target.value)}
                        min={form.start_date || new Date().toISOString().slice(0, 10)}
                        required
                        aria-label="End date"
                        disabled={villaLoading}
                      />
                    </div>
                  </div>
                  {/* Guest counts */}
                  <div className="flex items-center mt-2 space-x-3 text-sm">
                    <div>
                      <label className="font-medium mr-1">Adults</label>
                      <input
                        type="number"
                        className="border rounded w-16 px-2 py-1"
                        value={form.adults}
                        onChange={e =>
                          handleInputChange("adults", Math.max(1, Number(e.target.value)))
                        }
                        min={1}
                        max={villa.occupancy}
                        disabled={villaLoading}
                        aria-label="Number of adults"
                      />
                    </div>
                    <div>
                      <label className="font-medium mr-1">Children</label>
                      <input
                        type="number"
                        className="border rounded w-16 px-2 py-1"
                        value={form.children}
                        onChange={e =>
                          handleInputChange("children", Math.max(0, Number(e.target.value)))
                        }
                        min={0}
                        max={villa.occupancy}
                        disabled={villaLoading}
                        aria-label="Number of children"
                      />
                    </div>
                    <div>
                      <label className="font-medium mr-1">Infants</label>
                      <input
                        type="number"
                        className="border rounded w-16 px-2 py-1"
                        value={form.infants}
                        onChange={e =>
                          handleInputChange("infants", Math.max(0, Number(e.target.value)))
                        }
                        min={0}
                        max={villa.occupancy}
                        disabled={villaLoading}
                        aria-label="Number of infants"
                      />
                    </div>
                  </div>
                  {/* Price breakdown */}
                  <div className="mt-2">
                    <div className="font-semibold">Pricing</div>
                    <div className="text-gray-700 text-sm">
                      {priceBreakdown.nights > 0 ? (
                        <ul className="mt-1">
                          <li>
                            <span>
                              {priceBreakdown.nights} nights ×{" "}
                              {villa.price_per_night.toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                              })}{" "}
                              ={" "}
                              <span className="font-medium">
                                {priceBreakdown.subtotal.toLocaleString("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                })}
                              </span>
                            </span>
                          </li>
                          <li>
                            Cleaning fee:{" "}
                            {villa.cleaning_fee.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                          </li>
                          <li>
                            Service fee:{" "}
                            {villa.service_fee.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                          </li>
                          <li className="mt-2 font-bold text-base">
                            Total:{" "}
                            <span className="text-blue-800">
                              {priceBreakdown.total_price.toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                              })}
                            </span>
                          </li>
                        </ul>
                      ) : (
                        <span className="italic text-gray-400">Set valid dates to see price.</span>
                      )}
                    </div>
                  </div>
                  {/* Policies */}
                  <div className="mt-3 border-t pt-3">
                    <div className="font-semibold text-sm">Cancellation Policy</div>
                    <div className="text-gray-600 text-sm">{getCancellationSnippet()}</div>
                  </div>
                </div>
              )}
              <div className="flex justify-between mt-8 space-x-2">
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="Cancel booking"
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                  tabIndex={0}
                  aria-disabled={isStepLocked}
                  disabled={isStepLocked}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Continue to guest details"
                  className={`px-6 py-2 rounded font-medium text-white ${
                    isStepLocked
                      ? "bg-blue-300 cursor-not-allowed"
                      : "bg-blue-700 hover:bg-blue-800"
                  }`}
                  tabIndex={0}
                  disabled={isStepLocked}
                >
                  Next
                </button>
              </div>
            </>
          )}
          {/* Step 1: Guest/contact+ID/Agreement */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <div className="flex space-x-3 items-center mb-1 mt-2">
                  <img
                    src={user?.profile_photo_url
                      ? user.profile_photo_url
                      : `https://picsum.photos/seed/profile${user?.user_id || ""}/36/36`}
                    alt="Your profile"
                    className="rounded-full w-9 h-9 object-cover border"
                  />
                  <span className="font-semibold text-gray-700">{user?.name}</span>
                  <span className="text-gray-500 text-xs">
                    ({user?.email})
                  </span>
                </div>
                <div className="my-1">
                  <label htmlFor="user-contact" className="text-sm font-medium">Contact Phone:</label>
                  <input
                    id="user-contact"
                    type="tel"
                    className="border px-2 py-1 rounded ml-2 w-48"
                    value={
                      typeof user?.contact_info === "string"
                        ? user.contact_info
                        : (user?.contact_info?.phone || "")
                    }
                    readOnly
                    disabled
                  />
                </div>
                <div>
                  <label className="flex items-center mt-2 space-x-2">
                    <input
                      type="checkbox"
                      className="accent-blue-600 mr-1"
                      checked={form.is_guest_id_provided}
                      onChange={e =>
                        handleInputChange("is_guest_id_provided", e.target.checked)
                      }
                      aria-checked={form.is_guest_id_provided}
                      tabIndex={0}
                    />
                    <span className="select-none text-sm">
                      I have provided my photo ID for booking (MVP).
                    </span>
                  </label>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded p-3 mt-1">
                  <div className="font-medium text-gray-700">
                    Before continuing, make sure you agree to:
                  </div>
                  <ul className="pl-5 list-disc text-gray-700 text-sm mt-1">
                    <li>All posted house rules for this property</li>
                    <li>CliffBnb cancellation policy: <span className="italic">{getCancellationSnippet() || "N/A"}</span></li>
                  </ul>
                </div>
                {!is_email_confirmed && (
                  <div className="mt-3">
                    <div className="bg-yellow-100 px-3 py-2 rounded text-yellow-900 text-sm">
                      Please confirm your email before completing your booking. Check your inbox for a confirmation link.
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-between mt-8 space-x-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                  aria-label="Back to summary"
                  tabIndex={0}
                  aria-disabled={isStepLocked}
                  disabled={isStepLocked}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className={`px-6 py-2 rounded font-medium text-white ${
                    isStepLocked
                      ? "bg-blue-300 cursor-not-allowed"
                      : "bg-blue-700 hover:bg-blue-800"
                  }`}
                  aria-label="Continue to payment"
                  tabIndex={0}
                  disabled={isStepLocked}
                >
                  Next
                </button>
              </div>
            </>
          )}
          {/* Step 2: Payment */}
          {step === 2 && (
            <>
              <form autoComplete="off" onSubmit={handleBookingSubmit}>
                <fieldset disabled={isSubmitting}>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="card_number">
                        Card Number
                      </label>
                      <input
                        id="card_number"
                        type="text"
                        inputMode="numeric"
                        pattern="\d*"
                        autoComplete="cc-number"
                        maxLength={16}
                        className="border rounded px-2 py-1 w-full"
                        placeholder="1234 5678 9012 3456"
                        value={payment.card_number}
                        onChange={e =>
                          setPayment(prev => ({
                            ...prev,
                            card_number: e.target.value.replace(/[^\d]/g, "").slice(0, 16),
                          }))
                        }
                        aria-label="Credit Card Number"
                        tabIndex={0}
                        aria-invalid={Boolean(stepError)}
                      />
                    </div>
                    <div className="flex space-x-2">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="expiry">
                          Expiry (MM/YY)
                        </label>
                        <input
                          id="expiry"
                          type="text"
                          placeholder="08/29"
                          maxLength={5}
                          className="border rounded px-2 py-1 w-full"
                          value={payment.expiry}
                          onChange={e =>
                            setPayment(prev => ({
                              ...prev,
                              expiry: e.target.value.replace(/[^\d/]/g, "").slice(0, 5),
                            }))
                          }
                          aria-label="Expiry"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="cvc">
                          CVC
                        </label>
                        <input
                          id="cvc"
                          type="text"
                          pattern="\d*"
                          inputMode="numeric"
                          maxLength={4}
                          className="border rounded px-2 py-1 w-full"
                          placeholder="123"
                          value={payment.cvc}
                          onChange={e =>
                            setPayment(prev => ({
                              ...prev,
                              cvc: e.target.value.replace(/[^\d]/g, "").slice(0, 4),
                            }))
                          }
                          aria-label="CVC"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="name_on_card">
                        Name on Card
                      </label>
                      <input
                        id="name_on_card"
                        type="text"
                        className="border rounded px-2 py-1 w-full"
                        placeholder="Full Name"
                        value={payment.name_on_card}
                        onChange={e =>
                          setPayment(prev => ({
                            ...prev,
                            name_on_card: e.target.value,
                          }))
                        }
                        aria-label="Name on card"
                      />
                    </div>
                  </div>
                </fieldset>
                <div className="flex justify-between mt-8 space-x-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                    aria-label="Back to guest details"
                    tabIndex={0}
                    aria-disabled={isSubmitting}
                    disabled={isSubmitting}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    aria-label="Book now"
                    className={`px-6 py-2 rounded font-medium text-white flex gap-2 items-center ${
                      isSubmitting
                        ? "bg-blue-300 cursor-not-allowed"
                        : "bg-blue-700 hover:bg-blue-800"
                    }`}
                    tabIndex={0}
                    disabled={isSubmitting}
                  >
                    {isSubmitting && (
                      <span className="animate-spin inline-block w-4 h-4 border-t-2 border-white rounded-full" />
                    )}
                    Book Now
                  </button>
                </div>
              </form>
            </>
          )}
          {/* Step 3: Confirmation */}
          {step === 3 && (
            <>
              {bookingResult ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="inline-flex items-center justify-center bg-emerald-200 text-emerald-700 rounded-full w-8 h-8">
                      <svg aria-label="Success" width="28" height="28" fill="none">
                        <circle cx="14" cy="14" r="14" fill="#34d399" />
                        <path
                          d="M9 14l3 3.5L19 11"
                          stroke="#fff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="font-semibold text-lg text-green-700">Booking Confirmed!</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-700">Reference:</span>{" "}
                    <span className="font-mono text-gray-900 bg-gray-100 px-2 rounded">{bookingResult.booking_id}</span>
                  </div>
                  <div className="rounded bg-blue-50 px-3 py-2">
                    <div className="text-gray-700 mb-2">
                      <span className="font-semibold">
                        {villa?.name} ({villa?.location})
                      </span>
                      <br />
                      {bookingResult.start_date} → {bookingResult.end_date}
                    </div>
                    <div className="text-gray-900 font-bold text-lg">
                      {bookingResult.total_price.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 mt-3">
                    <Link
                      className="text-white bg-blue-700 hover:bg-blue-800 font-medium rounded px-4 py-2 text-center w-full"
                      to={`/booking/${bookingResult.booking_id}`}
                      tabIndex={0}
                    >
                      View Booking Details
                    </Link>
                    <Link
                      className="text-blue-700 hover:underline rounded px-4 py-2 text-center w-full"
                      to={`/messages`}
                      tabIndex={0}
                    >
                      Message Host (Contact)
                    </Link>
                    <Link
                      to="/dashboard/guest"
                      className="text-gray-600 hover:underline px-6 py-2 rounded text-sm text-center w-full"
                      tabIndex={0}
                    >
                      Return to Dashboard
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-blue-600">Loading confirmation…</div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
};

export default UV_BookingFlow;