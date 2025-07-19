import React from "react";
import { useAppStore } from "@/store/main";

// MAP: spinner context value to user-friendly loading text
const contextLabel: Record<string, string> = {
  booking_payment: "Processing Payment...",
  search: "Searching...",
  photo_upload: "Uploading Photo...",
  profile_update: "Updating Profile...",
  calendar_sync: "Syncing Calendar...",
  review_submit: "Submitting Review...",
  messaging: "Sending Message...",
};

const GV_LoaderSpinner: React.FC = () => {
  // Individual selectors REQUIRED per Zustand best practice
  const is_loading = useAppStore((state) => state.loader_state.is_loading);
  const context = useAppStore((state) => state.loader_state.context);

  // Spinner label
  let label = "Loading...";
  if (context && typeof context === "string") {
    if (contextLabel[context]) label = contextLabel[context];
    else if (context.length <= 35 && /^[a-z0-9_ -]+$/i.test(context)) label = context.charAt(0).toUpperCase() + context.slice(1).replace(/_/g, " ") + "...";
  }

  // Spinner is ALWAYS visible when mounted (used inside overlay div in App wrapper)
  // We still keep layout/sizing/aria even for inline mode
  return (
    <>
      <div
        className="flex flex-col items-center justify-center"
        role="status"
        aria-live="polite"
        aria-busy={is_loading ? "true" : "false"}
      >
        {/* SVG Spinner: accessible, tailwind-animated */}
        <svg
          aria-hidden="true"
          className="w-14 h-14 mb-4 text-brand-500 animate-spin fill-brand-500"
          viewBox="0 0 50 50"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          tabIndex={-1}
        >
          <circle
            className="opacity-20"
            cx="25"
            cy="25"
            r="20"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
          />
          <path
            className="opacity-100"
            fill="currentColor"
            d="
              M25 5
              a 20 20 0 0 1 0 40
              a 20 20 0 0 1 0 -40
              M25 5
              a 20 20 0 0 1 11.5 36.6
              "
          />
        </svg>
        {/* Label/description for spinner */}
        <span
          className="text-base text-gray-700 font-medium text-center select-none"
          aria-live="polite"
          aria-atomic="true"
        >
          {label}
        </span>
      </div>
    </>
  );
};

export default GV_LoaderSpinner;