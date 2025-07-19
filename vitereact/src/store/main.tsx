import { create } from "zustand";
import { persist } from "zustand/middleware";
import { io, Socket } from "socket.io-client";
import axios from "axios";

// ------------ Type Definitions ------------

// User Type (as per backend OpenAPI/AsyncAPI)
export interface User {
  user_id: string;
  email: string;
  name: string;
  password_hash?: string; // Not used on FE, but may exist in schema
  role: "guest" | "host" | "admin" | "suspended" | string | null;
  profile_photo_url: string | null;
  contact_info: { phone: string | null } | string | null;
  host_bio: string | null;
  is_email_confirmed: boolean;
  email_confirmation_token?: string | null;
  password_reset_token?: string | null;
  has_unread_messages: boolean;
  has_unread_notifications: boolean;
  created_at?: string;
  updated_at?: string;
}

// Search Query Type
export interface SearchQuery {
  location: string | null;
  date_range: { start_date: string | null; end_date: string | null };
  guest_count: { adults: number; children: number; infants: number };
  price_min: number | null;
  price_max: number | null;
  amenities: string[];
  sort_by: "price" | "rating" | "popularity" | "newest";
  map_bounds: { ne_lat: number; ne_lng: number; sw_lat: number; sw_lng: number } | null;
  page: number;
  view_mode: "list" | "map";
}

// Notification
export interface Notification {
  notification_id: string;
  type: string;
  content: string;
  created_at: string;
  is_read: boolean;
}

// Message Thread
export interface MessageThread {
  thread_id: string;
  participants: string[];
  villa_id: string | null;
  booking_id: string | null;
  last_message_at: string;
  unread_count: number;
}

// Loader/Error State
export interface LoaderState {
  is_loading: boolean;
  context: string | null;
}
export interface ErrorState {
  has_error: boolean;
  message: string | null;
  context: string | null;
}

// ------------- Store State and Actions -------------

interface AppStoreState {
  // STATE
  user: User | null;
  auth_token: string | null;
  email_confirmation_pending: boolean;
  search_query: SearchQuery;
  notification_queue: Notification[];
  message_threads: MessageThread[];
  saved_villa_ids: string[];
  loader_state: LoaderState;
  error_state: ErrorState;

  // DO NOT persist socket connection (runtime only)
  socket: Socket | null;

  // ACTIONS
  // -- User/Auth
  set_user: (user: User | null, token: string | null) => void;
  set_auth_token: (token: string | null) => void;
  set_email_confirmation_pending: (pending: boolean) => void;
  logout: () => void;

  // -- Search Query
  set_search_query: (query: Partial<SearchQuery>) => void;
  reset_search_query: () => void;

  // -- Notifications
  set_notification_queue: (queue: Notification[]) => void;
  add_notification: (notif: Notification) => void;
  remove_notification: (notification_id: string) => void;
  clear_notification_queue: () => void;
  mark_notification_read: (notification_id: string) => void;

  // -- Message Threads
  set_message_threads: (threads: MessageThread[]) => void;
  add_message_thread: (thread: MessageThread) => void;
  remove_message_thread: (thread_id: string) => void;
  clear_message_threads: () => void;

  // -- Saved Villas
  set_saved_villa_ids: (villa_ids: string[]) => void;
  add_saved_villa_id: (villa_id: string) => void;
  remove_saved_villa_id: (villa_id: string) => void;
  clear_saved_villa_ids: () => void;

  // -- Loader/Error
  set_loader_state: (loader: Partial<LoaderState>) => void;
  reset_loader_state: () => void;
  set_error_state: (err: Partial<ErrorState>) => void;
  reset_error_state: () => void;

  // -- WebSocket
  connect_socket: () => void;
  disconnect_socket: () => void;
}

// ----------- Defaults ---------------
const default_search_query: SearchQuery = {
  location: null,
  date_range: { start_date: null, end_date: null },
  guest_count: { adults: 1, children: 0, infants: 0 },
  price_min: null,
  price_max: null,
  amenities: [],
  sort_by: "popularity",
  map_bounds: null,
  page: 1,
  view_mode: "list",
};
const default_loader_state: LoaderState = { is_loading: false, context: null };
const default_error_state: ErrorState = { has_error: false, message: null, context: null };

//-------- Socket handling helper (not persisted) --------
const SOCKET_NAMESPACE = "/ws"; // per backend

// --------- Implementation -------------

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      // ----------------- STATE -----------------
      user: null,
      auth_token: null,
      email_confirmation_pending: false,
      search_query: default_search_query,
      notification_queue: [],
      message_threads: [],
      saved_villa_ids: [],
      loader_state: default_loader_state,
      error_state: default_error_state,

      // Ephemeral
      socket: null,

      // ------------- ACTIONS ---------------

      set_user: (user, token) => {
        set({ user });
        if (token !== undefined) set({ auth_token: token });
        // If user is authenticated, (re)connect/re-auth socket
        if (user && token) {
          setTimeout(() => get().connect_socket(), 150);
        }
      },

      set_auth_token: (token) => set({ auth_token: token }),

      set_email_confirmation_pending: (pending) => set({ email_confirmation_pending: pending }),

      logout: () => {
        // Wipe all persisted state, disconnect socket.
        if (get().socket) get().disconnect_socket();
        set({
          user: null,
          auth_token: null,
          email_confirmation_pending: false,
          search_query: default_search_query,
          notification_queue: [],
          message_threads: [],
          saved_villa_ids: [],
          loader_state: default_loader_state,
          error_state: default_error_state,
          socket: null,
        });
        // Remove from localStorage ("cliffbnb-global")
        window.localStorage.removeItem("cliffbnb-global");
      },

      set_search_query: (newQuery) => set((state) => ({
        search_query: { ...state.search_query, ...newQuery },
      })),
      reset_search_query: () => set({ search_query: default_search_query }),

      // --- Notifications ---
      set_notification_queue: (queue) => set({ notification_queue: queue }),
      add_notification: (notif) => set((state) => ({
        notification_queue: [
          notif,
          ...state.notification_queue.filter(n => n.notification_id !== notif.notification_id),
        ],
      })),
      remove_notification: (notification_id) => set((state) => ({
        notification_queue: state.notification_queue.filter(n => n.notification_id !== notification_id),
      })),
      clear_notification_queue: () => set({ notification_queue: [] }),
      mark_notification_read: (notification_id) => set((state) => ({
        notification_queue: state.notification_queue.map(n =>
          n.notification_id === notification_id ? { ...n, is_read: true } : n
        ),
      })),

      // --- Message Threads ---
      set_message_threads: (threads) => set({ message_threads: threads }),
      add_message_thread: (thread) => set((state) => ({
        message_threads: [
          thread,
          ...state.message_threads.filter(t => t.thread_id !== thread.thread_id),
        ],
      })),
      remove_message_thread: (thread_id) => set((state) => ({
        message_threads: state.message_threads.filter(t => t.thread_id !== thread_id),
      })),
      clear_message_threads: () => set({ message_threads: [] }),

      // --- Saved Villas ---
      set_saved_villa_ids: (villas) => set({ saved_villa_ids: villas }),
      add_saved_villa_id: (villa_id) => set((state) => ({
        saved_villa_ids: state.saved_villa_ids.includes(villa_id)
          ? state.saved_villa_ids
          : [...state.saved_villa_ids, villa_id],
      })),
      remove_saved_villa_id: (villa_id) => set((state) => ({
        saved_villa_ids: state.saved_villa_ids.filter(id => id !== villa_id),
      })),
      clear_saved_villa_ids: () => set({ saved_villa_ids: [] }),

      // --- Loader/Error State ---
      set_loader_state: (partial) => set((state) => ({
        loader_state: { ...state.loader_state, ...partial },
      })),
      reset_loader_state: () => set({ loader_state: default_loader_state }),
      set_error_state: (partial) => set((state) => ({
        error_state: { ...state.error_state, ...partial, has_error: true },
      })),
      reset_error_state: () => set({ error_state: default_error_state }),

      // --- WebSocket ---
      connect_socket: () => {
        if (typeof window === "undefined") return; // SSR safe
        if (get().socket) {
          // Already connected
          return;
        }
        const api_base = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
        const url = api_base.replace(/^http/, "ws") + SOCKET_NAMESPACE;
        const token = get().auth_token;
        if (!token || !get().user) return;

        const socket = io(url, {
          path: SOCKET_NAMESPACE,
          transports: ["websocket"],
          autoConnect: true,
          auth: { token },
          query: { user_id: get().user?.user_id },
        });

        // ---- SUBSCRIBE to channels per user ----
        // User profile/unread counts/notifications
        socket.on(`user/${get().user!.user_id}/state`, (payload: Partial<User>) => {
          set((state) => ({
            user: { ...state.user, ...payload },
          }));
        });

        socket.on(
          `user/${get().user!.user_id}/notifications`,
          (notif: Notification) => {
            get().add_notification(notif);
          }
        );

        socket.on(
          `user/${get().user!.user_id}/unread_counts`,
          (counts: { has_unread_messages: boolean; has_unread_notifications: boolean }) => {
            set((state) => ({
              user: state.user
                ? {
                    ...state.user,
                    has_unread_messages: counts.has_unread_messages,
                    has_unread_notifications: counts.has_unread_notifications,
                  }
                : null,
            }));
          }
        );

        socket.on(
          `user/${get().user!.user_id}/threads`,
          (threadEvent: { type: string; payload: MessageThread }) => {
            if (threadEvent.type === "thread_created" || threadEvent.type === "thread_updated") {
              get().add_message_thread(threadEvent.payload);
            } else if (threadEvent.type === "thread_archived") {
              get().remove_message_thread(threadEvent.payload.thread_id);
            }
          }
        );

        socket.on(
          `user/${get().user!.user_id}/saved_villas`,
          (evt: { type: string; payload: any }) => {
            if (evt.type === "favorite_added") {
              get().add_saved_villa_id(evt.payload.villa_id);
            } else if (evt.type === "favorite_removed") {
              get().remove_saved_villa_id(evt.payload.villa_id);
            }
          }
        );

        // Bookings, etc as needed
        // You can expand with booking/message/other streams similarly if you want

        socket.on("disconnect", () => {
          set({ socket: null });
        });

        set({ socket });
      },
      disconnect_socket: () => {
        const socket = get().socket;
        try {
          socket?.disconnect();
        } catch (_) {}
        set({ socket: null });
      },
    }),
    {
      name: "cliffbnb-global",
      partialize: (state) => {
        // Only persist primitives, never functions/socket instance
        const {
          user,
          auth_token,
          email_confirmation_pending,
          search_query,
          notification_queue,
          message_threads,
          saved_villa_ids,
          loader_state,
          error_state,
        } = state as AppStoreState;
        return {
          user,
          auth_token,
          email_confirmation_pending,
          search_query,
          notification_queue,
          message_threads,
          saved_villa_ids,
          loader_state,
          error_state,
        };
      },
      // Leave socket out of persistence
      skipHydration: false,
      version: 2,
    }
  )
);

// --- Additional: on restore/hydration, attempt to reconnect socket if possible
if (typeof window !== "undefined") {
  window.addEventListener("storage", () => {
    // If another tab logs in/out, reflect here
    const state = window.localStorage.getItem("cliffbnb-global");
    if (state) {
      try {
        const parsed = JSON.parse(state);
        // If user is now logged in with auth_token, make sure socket is connected
        if (parsed.user && parsed.auth_token) {
          setTimeout(() => {
            useAppStore.getState().connect_socket();
          }, 150);
        }
      } catch {}
    }
  });
}

// --- Quick helpers to rehydrate socket after refresh/login
if (typeof window !== "undefined") {
  const state = useAppStore.getState();
  if (state.user && state.auth_token && !state.socket) {
    setTimeout(() => state.connect_socket(), 100);
  }
}
