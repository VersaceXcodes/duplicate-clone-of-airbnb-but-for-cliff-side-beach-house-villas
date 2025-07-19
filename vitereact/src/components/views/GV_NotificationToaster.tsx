import React, { useEffect, useRef, useCallback, useState } from "react";
import { useAppStore } from "@/store/main";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

// No hallucinated icons - define in this file!
const ICONS: Record<string, React.ReactNode> = {
  booking_confirmed: (
    <span aria-hidden="true" className="text-green-500">
      {/* Checkmark */}
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
    </span>
  ),
  booking_canceled: (
    <span aria-hidden="true" className="text-red-500">
      {/* Xmark */}
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </span>
  ),
  message: (
    <span aria-hidden="true" className="text-blue-500">
      {/* Envelope */}
      <svg className="w-6 h-6" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2">
        <path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4z" />
        <path d="M16 4l-6 5-6-5" />
      </svg>
    </span>
  ),
  review_posted: (
    <span aria-hidden="true" className="text-yellow-500">
      {/* Star */}
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.962a1 1 0 00.95.69h4.18c.969 0 1.371 1.24.588 1.81l-3.384 2.46a1 1 0 00-.364 1.118l1.287 3.963c.3.921-.755 1.688-1.54 1.117l-3.384-2.46a1 1 0 00-1.176 0l-3.384 2.46c-.785.571-1.84-.196-1.54-1.117l1.287-3.963a1 1 0 00-.364-1.118l-3.384-2.46c-.783-.57-.38-1.81.588-1.81h4.18a1 1 0 00.95-.69l1.286-3.962z" />
      </svg>
    </span>
  ),
  info: (
    <span aria-hidden="true" className="text-sky-500">
      {/* Info circle */}
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/>
      </svg>
    </span>
  ),
  error: (
    <span aria-hidden="true" className="text-red-600">
      {/* Exclamation triangle */}
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 9v2m0 4h.01M21 19a2.001 2.001 0 01-1.7 1.954V21a9 9 0 11-14.6-6.1A2 2 0 013 14V7a2 2 0 012-2h10a2 2 0 012 2v3a2.001 2.001 0 011.7 1.954A9.03 9.03 0 0121 19z"
        />
      </svg>
    </span>
  ),
};

// Map notification.type to status for coloring
function getToastStatus(type: string): "success" | "error" | "info" | "warning" {
  switch (type) {
    case "booking_confirmed":
    case "payout_completed":
      return "success";
    case "booking_canceled":
      return "error";
    case "review_posted":
    case "message":
      return "info";
    case "warning":
      return "warning";
    default:
      return "info";
  }
}

const MAX_VISIBLE_TOASTS = 4;
const TOAST_DISMISS_MS = 6000;

export const GV_NotificationToaster: React.FC = () => {
  // --- Global state ---
  const user = useAppStore(state => state.user);
  const notification_queue = useAppStore(state => state.notification_queue);
  const remove_notification = useAppStore(state => state.remove_notification);
  const mark_notification_read_locally = useAppStore(state => state.mark_notification_read);
  const set_notification_queue = useAppStore(state => state.set_notification_queue);

  // --- Local state for toasts currently visible (queue may be large) ---
  // Holds notification_id for shown toasts, with mounting timestamp (so auto-dismiss works even as queue reorders)
  const [visibleToasts, setVisibleToasts] = useState<
    { notification_id: string; timer_started: number }[]
  >([]);

  // Map for auto-dismiss timer refs, cleaned up on unmount
  const toastsTimers = useRef<Record<string, NodeJS.Timeout | number>>({});

  // --- react-query setup ---
  const queryClient = useQueryClient();

  // --- Fetch server notifications when mounted if user is logged in and queue is empty ---
  const fetchNotifications = useCallback(async (): Promise<Notification[]> => {
    if (!user || !user.user_id) return [];
    const response = await axios.get(
      `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/notifications`,
      {
        params: {
          user_id: user.user_id,
          limit: 25,
        },
        headers: {
          Authorization: useAppStore.getState().auth_token
            ? `Bearer ${useAppStore.getState().auth_token}`
            : undefined,
        },
      }
    );
    if (Array.isArray(response.data)) return response.data;
    // May be nested due to OpenAPI response
    if (response.data && Array.isArray(response.data.notifications)) {
      return response.data.notifications;
    }
    return [];
  }, [user]);

  const {
    data: notificationsFetched,
    isLoading: isNotificationsLoading,
    error: notificationsError,
    refetch: fetchNotificationsNow,
  } = useQuery<Notification[], Error>({
    queryKey: ["notifications", user?.user_id],
    queryFn: fetchNotifications,
    enabled: !!user && !!user.user_id && notification_queue.length === 0,
    onSuccess: (data) => set_notification_queue(data),
    staleTime: 1000 * 60, // 1 minute cache
  });

  // --- Dismiss notification on backend ---
  const markAsReadMutation = useMutation({
    mutationFn: async (notification: Notification) => {
      // PATCH /notifications/{notification_id} { is_read: true }
      await axios.patch(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/notifications/${notification.notification_id}`,
        { is_read: true },
        {
          headers: {
            Authorization: useAppStore.getState().auth_token
              ? `Bearer ${useAppStore.getState().auth_token}`
              : undefined,
          },
        }
      );
      // Update local store for quick UI state (also triggers toast remove via filter)
      mark_notification_read_locally(notification.notification_id);
      remove_notification(notification.notification_id);
      // Refresh global, but don't refetch unnecessarily
      // Not invalidating as notification_queue comes mainly via ws
    }
  });

  // --- Auto show notifications (all unread) ---
  useEffect(() => {
    // Only show at most MAX_VISIBLE_TOASTS; take unread, order by created_at desc (newest first)
    const unread = notification_queue.filter((n) => !n.is_read);
    // Prevent duplicate toasts by showing only those not already visible
    setVisibleToasts((current) => {
      // Remove disappeared from queue
      const stillThere = current.filter((item) =>
        unread.find((n) => n.notification_id === item.notification_id)
      );
      // Add new unread up to max
      const newToShow = unread
        .filter(
          (n) =>
            !stillThere.find((item) => item.notification_id === n.notification_id)
        )
        .slice(0, MAX_VISIBLE_TOASTS - stillThere.length)
        .map((n) => ({
          notification_id: n.notification_id,
          timer_started: Date.now(),
        }));
      return [...stillThere, ...newToShow];
    });
  }, [notification_queue]);

  // --- For each visible toast, start auto-dismiss timer ---
  useEffect(() => {
    visibleToasts.forEach(({ notification_id }) => {
      if (toastsTimers.current[notification_id]) return;
      toastsTimers.current[notification_id] = window.setTimeout(() => {
        handleDismiss(notification_id);
      }, TOAST_DISMISS_MS);
    });
    // Clean up timers for toasts no longer visible
    const activeIds = visibleToasts.map((t) => t.notification_id);
    Object.keys(toastsTimers.current).forEach((id) => {
      if (!activeIds.includes(id)) {
        clearTimeout(toastsTimers.current[id]);
        delete toastsTimers.current[id];
      }
    });
    // On unmount, clear all
    return () => {
      Object.values(toastsTimers.current).forEach((timer) => clearTimeout(timer as number));
      toastsTimers.current = {};
    };
    // eslint-disable-next-line
  }, [visibleToasts]);

  // --- Dismiss single toast (either via timer or user interaction) ---
  const handleDismiss = useCallback(
    (notification_id: string) => {
      const notif = notification_queue.find((n) => n.notification_id === notification_id);
      if (!notif) {
        setVisibleToasts((current) =>
          current.filter((t) => t.notification_id !== notification_id)
        );
        return;
      }
      // Mark as read on backend and local remove on success
      markAsReadMutation.mutate(notif);
      setVisibleToasts((current) =>
        current.filter((t) => t.notification_id !== notification_id)
      );
    },
    [markAsReadMutation, notification_queue]
  );

  // --- Support ESC key to dismiss top toast when one is focused ---
  const toastRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && visibleToasts.length > 0) {
        // Find focused toast or just top
        const focused = document.activeElement;
        let activeToast = null;
        if (focused) {
          activeToast = Object.entries(toastRefs.current).find(
            ([, ref]) => ref === focused
          );
        }
        const toastToClose =
          (activeToast && activeToast[0]) || visibleToasts[0].notification_id;
        handleDismiss(toastToClose);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visibleToasts, handleDismiss]);

  // --- Determine icon and color for each toast ---
  function getIcon(type: string) {
    if (ICONS[type]) return ICONS[type];
    // Fallback for message, review, etc.
    if (type.includes("booking")) return ICONS["booking_confirmed"];
    if (type.includes("message")) return ICONS["message"];
    if (type.includes("review")) return ICONS["review_posted"];
    if (type.includes("error")) return ICONS["error"];
    if (type.includes("info")) return ICONS["info"];
    return ICONS["info"];
  }
  function getToastColor(type: string): string {
    switch (getToastStatus(type)) {
      case "success":
        return "bg-green-50 border-green-400 text-green-900";
      case "error":
        return "bg-red-50 border-red-400 text-red-900";
      case "warning":
        return "bg-yellow-50 border-yellow-400 text-yellow-900";
      case "info":
      default:
        return "bg-sky-50 border-sky-400 text-sky-900";
    }
  }
  function getButtonColor(type: string): string {
    switch (getToastStatus(type)) {
      case "success":
        return "hover:bg-green-100";
      case "error":
        return "hover:bg-red-100";
      case "warning":
        return "hover:bg-yellow-100";
      case "info":
      default:
        return "hover:bg-sky-100";
    }
  }

  // --- Sanitize notification text (never render as HTML, just as text) ---
  function sanitizeContent(content: string): string {
    return content.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").slice(0, 2000);
  }

  // --- Format timestamp to readable (e.g. just now, X min ago, etc) ---
  function niceTime(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((+now - +date) / 1000);
      if (diffSec < 5) return "just now";
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      return `${diffDay}d ago`;
    } catch {
      return "";
    }
  }

  // --- Add error toast on mutation error ---
  useEffect(() => {
    if (markAsReadMutation.isError && markAsReadMutation.error instanceof Error) {
      // In prod would push to error_state as a global error, but for UX: show local error toast.
      setVisibleToasts((current) => [
        ...current,
        {
          notification_id: `error_local_${Date.now()}`,
          timer_started: Date.now(),
        },
      ]);
      // We do not push to notification_queue, since it's only for backend/official notifications.
    }
    // eslint-disable-next-line
  }, [markAsReadMutation.isError]);

  // --- Don't render on admin route (enforced by parent), but safe ---
  if (!user) return null;

  return (
    <>
      <div
        className="fixed z-40 bottom-6 right-6 max-w-[calc(100vw-1.5rem)] flex flex-col gap-4 items-end"
        style={{
          pointerEvents: visibleToasts.length > 0 ? "auto" : "none",
        }}
        aria-live="polite"
        aria-atomic="true"
      >
        {visibleToasts.map(({ notification_id }, nidx) => {
          const notif =
            notification_queue.find((n) => n.notification_id === notification_id) ||
            (notification_id.startsWith("error_local_")
              ? {
                  notification_id,
                  type: "error",
                  content:
                    "Failed to mark notification as read. Please try again.",
                  created_at: new Date().toISOString(),
                  is_read: false,
                }
              : null);
          if (!notif) return null;

          const toastColor = getToastColor(notif.type);
          const btnColor = getButtonColor(notif.type);
          return (
            <div
              key={notification_id}
              role="alert"
              tabIndex={0}
              className={`shadow-lg border-l-4 rounded-md px-4 py-4 min-w-[260px] max-w-md ${toastColor} relative animate-in slide-in-from-bottom-3`}
              ref={(el) => (toastRefs.current[notification_id] = el)}
              aria-label={
                notif.type === "error"
                  ? "Error notification"
                  : notif.type === "info"
                  ? "Information"
                  : notif.type.replace(/_/g, " ")
              }
            >
              <div className="flex items-start gap-3">
                <div className="pt-1">{getIcon(notif.type)}</div>
                <div className="flex-1 pr-6">
                  <div className="font-semibold mb-1">
                    {notif.type
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </div>
                  <div className="text-base break-words">
                    {sanitizeContent(notif.content)}
                  </div>
                  <div className="text-xs mt-2 text-gray-500">
                    {niceTime(notif.created_at)}
                  </div>
                </div>
                <button
                  aria-label="Dismiss notification"
                  onClick={() => handleDismiss(notification_id)}
                  tabIndex={0}
                  className={`absolute top-2 right-2 rounded transition p-1 focus:outline-none ${btnColor}`}
                >
                  <svg
                    aria-hidden="true"
                    className="w-4 h-4 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default GV_NotificationToaster;