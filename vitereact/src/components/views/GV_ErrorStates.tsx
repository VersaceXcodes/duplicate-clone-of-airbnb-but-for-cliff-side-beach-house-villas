import React from "react";
import { XMarkIcon, ArrowPathIcon } from "@heroicons/react/24/solid";
import { useAppStore } from "@/store/main";

export interface GV_ErrorStatesProps {
  message: string;
  onClose: () => void;
  field_errors?: { [field: string]: string };
  onRetry?: () => void;
  context?: string | null;
}

const GV_ErrorStates: React.FC<GV_ErrorStatesProps> = ({
  message,
  onClose,
  field_errors,
  onRetry,
  context,
}) => {
  // For accessibility: focus when shown
  const errorRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (errorRef.current) {
      errorRef.current.focus();
    }
  }, []);

  // Keyboard: escape closes
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <>
      <div
        ref={errorRef}
        tabIndex={-1}
        role="alert"
        aria-live="polite"
        className="relative max-w-lg w-full bg-red-50 border border-red-400 text-red-800 rounded-lg shadow-md px-6 py-5 mx-auto flex flex-col gap-3 focus:outline-none focus:ring-2 focus:ring-red-600"
        style={{ outline: "none" }}
        data-testid="gv-error-states"
      >
        {/* Close button (top right) */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
          aria-label="Dismiss error"
        >
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Main Error Icon and Message */}
        <div className="flex items-start gap-3">
          <span className="mt-1">
            {/* Alert SVG */}
            <svg
              className="h-6 w-6 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" fill="#fee2e2" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01"
                stroke="#b91c1c"
              />
            </svg>
          </span>
          <span className="flex-1 flex flex-col gap-1">
            <span className="font-semibold text-red-900 text-base">
              {message}
            </span>
            {context && (
              <span className="text-xs text-red-700 font-medium" data-testid="error-context">
                {context}
              </span>
            )}
          </span>
        </div>

        {/* Field errors */}
        {field_errors && Object.keys(field_errors).length > 0 && (
          <ul className="mt-2 pl-6 list-disc space-y-1" data-testid="field-errors">
            {Object.entries(field_errors).map(([field, msg]) => (
              <li key={field} className="text-sm text-red-700">
                <span className="font-medium">{field.replace(/_/g, " ")}:</span> {msg}
              </li>
            ))}
          </ul>
        )}

        {/* Retry Action --}}
        {onRetry && (
          <div className="flex flex-row items-center gap-2 mt-1">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center px-4 py-2 border border-red-500 rounded-md text-red-800 bg-red-100 hover:bg-red-200 hover:border-red-600 font-medium transition focus:outline-none focus:ring-2 focus:ring-red-400"
              aria-label="Retry action"
            >
              <ArrowPathIcon className="h-5 w-5 mr-2 opacity-70" aria-hidden="true" />
              Retry
            </button>
            <span className="text-xs text-red-500 font-medium ml-2">
              Try again
            </span>
          </div>
        )}
      </div>
    </>
  );
};

export default GV_ErrorStates;