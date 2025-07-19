import React, { useState, useEffect } from "react";
import { useAppStore } from "@/store/main";

// No endpoint to import (see analysis/TODO)

const GV_EmailConfirmationBanner: React.FC = () => {
  // Zustand selectors for critical fields (one per selector rule!)
  const user = useAppStore((s) => s.user);

  // Extract the required info
  const is_email_confirmed =
    typeof user?.is_email_confirmed === "boolean" ? user.is_email_confirmed : false;
  const email = typeof user?.email === "string" ? user.email : "";

  // Local state for resend status and error handling
  const [resend_loading, setResendLoading] = useState<boolean>(false);
  const [resend_success, setResendSuccess] = useState<boolean>(false);
  const [resend_error, setResendError] = useState<string | null>(null);

  // Effect: If email confirmed (via socket event or reload), hide banner and reset state
  useEffect(() => {
    if (is_email_confirmed) {
      setResendSuccess(false);
      setResendError(null);
      setResendLoading(false);
    }
  }, [is_email_confirmed]);

  // Handler for resend confirmation (NOT functional, see analysis)
  const handleResend = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setResendLoading(true);
    setResendSuccess(false);
    setResendError(null);
    // TODO: MISSING ENDPOINT for resend confirmation email (/auth/resend-confirm-email)
    // No public or documented endpoint to call, so just fake a short timer
    await new Promise((r) => setTimeout(r, 900));
    setResendLoading(false);
    setResendError(
      "Sorry, resending confirmation is not available at the moment. Please check your email inbox or try again later."
    );
  };

  // Only show banner if user exists, not confirmed
  if (!user || is_email_confirmed) {
    return null;
  }

  return (
    <>
      {/* Email confirmation banner (tailwind: sticky top, bg-yellow, shadow, text) */}
      <section
        className="w-full bg-yellow-50 border-b border-yellow-300 shadow-md py-3 px-2 md:px-0 z-40"
        aria-live="polite"
        aria-label="Email confirmation required"
        tabIndex={0}
      >
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
          <div className="flex-1 flex items-center gap-3 min-w-0">
            {/* Email Icon */}
            <div
              className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 border border-yellow-200"
            >
              {/* Simple mail icon */}
              <svg
                className="w-7 h-7 text-yellow-500"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                aria-label="Mail icon"
              >
                <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" fill="none" />
                <path d="M2 6l10 7 10-7" stroke="currentColor" fill="none" />
              </svg>
            </div>
            {/* Main message column */}
            <div className="flex flex-col min-w-0">
              <div className="font-semibold text-yellow-800 text-base md:text-lg">
                Confirm your email to unlock all features
              </div>
              <div className="text-[15px] text-yellow-700 truncate max-w-xs md:max-w-full" aria-live="polite">
                An activation link was sent to:{" "}
                <span className="font-semibold">{email}</span>
              </div>
              <div className="text-[15px] text-yellow-700 mt-1">
                You must confirm your email before booking or listing villas. Check your inbox (and spam). 
                <span className="inline-block ml-1">Didn’t get it?</span>
              </div>
            </div>
          </div>
          {/* Rightside actions */}
          <div className="flex flex-col items-start md:items-end gap-1 min-w-[170px] max-w-xs">
            {/* Resend Button */}
            <button
              type="button"
              className="inline-flex items-center font-semibold px-4 py-2 rounded-md bg-yellow-400 hover:bg-yellow-500 text-yellow-900 shadow transition disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-yellow-700"
              aria-label="Resend confirmation email"
              disabled={resend_loading || resend_success}
              onClick={handleResend}
              tabIndex={0}
              title={
                resend_loading
                  ? "Sending..."
                  : resend_success
                  ? "Confirmation sent"
                  : "This action is currently unavailable (see below)"
              }
            >
              {resend_loading && (
                <svg
                  className="animate-spin -ml-1 mr-1 h-5 w-5 text-yellow-900"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  ></path>
                </svg>
              )}
              Resend Confirmation Email
            </button>
            {/* Success or Error */}
            {resend_success && (
              <span
                className="text-green-700 text-sm font-medium mt-1"
                aria-live="polite"
              >
                Confirmation re-sent! Please check your inbox.
              </span>
            )}
            {resend_error && (
              <span className="text-red-700 text-sm mt-1" aria-live="polite">
                {resend_error}
              </span>
            )}
            {/* Disabled/Info about missing endpoint */}
            <span className="text-xs text-yellow-700 mt-1" aria-live="polite">
              {/* Note: *
                In MVP, resending is not available.
                Normally, you should receive your confirmation email within a minute.
                If you do not, please check your spam or contact support.
              */}
              {/* TODO: MISSING ENDPOINT for resend confirmation email. */}
              (If you did not receive the email, check your spam or contact support)
            </span>
          </div>
        </div>
      </section>
    </>
  );
};

export default GV_EmailConfirmationBanner;