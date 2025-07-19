import React, { useEffect, useRef, useState, KeyboardEvent, ChangeEvent } from "react";
import { useSearchParams, Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
// Zod-inferred types (by structure or via @/store/main and doc)
type User = import("@/store/main").User;
type MessageThread = import("@/store/main").MessageThread;
interface Message {
  message_id: string;
  thread_id: string;
  sender_user_id: string;
  content: string;
  sent_at: string;
  is_read: boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const fetchMessageThreads = async (user_id: string, token: string): Promise<MessageThread[]> => {
  const res = await axios.get(`${API_BASE}/message-threads`, {
    params: { participant_user_id: user_id },
    headers: { Authorization: `Bearer ${token}` },
  });
  // Map participant_user_ids to array
  return (res.data as any[]).map((thread) => ({
    ...thread,
    participants: thread.participant_user_ids.split(","),
    unread_count: thread.unread_counts
      ? parseInt(
          // Try to parse per-thread unread count for the user (usually a string like "user_1:2,user_2:0")
          (thread.unread_counts as string)
            .split(",")
            .find((e: string) => e.startsWith(`${user_id}:`))?.split(":")[1] ?? "0"
        )
      : 0,
  }));
};

const fetchMessagesForThread = async (
  thread_id: string,
  token: string
): Promise<Message[]> => {
  const res = await axios.get(`${API_BASE}/messages`, {
    params: { thread_id },
    headers: { Authorization: `Bearer ${token}` },
  });
  // Sort by sent_at ascending, just in case
  return (res.data as Message[]).sort(
    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
  );
};

const sendMessage = async (
  payload: { thread_id: string; sender_user_id: string; content: string },
  token: string
): Promise<Message> => {
  const res = await axios.post(
    `${API_BASE}/messages`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data as Message;
};

const markMessageAsRead = async ({
  message_id,
  token,
}: {
  message_id: string;
  token: string;
}): Promise<Message> => {
  const res = await axios.patch(
    `${API_BASE}/messages/${message_id}`,
    { is_read: true },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data as Message;
};

const getOtherParticipantUserId = (participants: string[], myUserId: string): string => {
  return participants.find((u) => u !== myUserId) || "";
};

const UV_Messaging: React.FC = () => {
  // Zustand selectors (individually)
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const loader_state = useAppStore((s) => s.loader_state);
  const set_loader_state = useAppStore((s) => s.set_loader_state);
  const reset_loader_state = useAppStore((s) => s.reset_loader_state);
  const error_state = useAppStore((s) => s.error_state);
  const set_error_state = useAppStore((s) => s.set_error_state);
  const reset_error_state = useAppStore((s) => s.reset_error_state);
  const set_message_threads = useAppStore((s) => s.set_message_threads);

  // --- Local component state
  const [active_thread_id, setActiveThreadId] = useState<string | null>(null);
  const [compose_content, setComposeContent] = useState<string>("");
  const [sidebarSearch, setSidebarSearch] = useState<string>("");
  const [markingAsRead, setMarkingAsRead] = useState<Set<string>>(new Set());
  const [localError, setLocalError] = useState<string | null>(null);

  // --- For initial url param (thread_id)
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // --- Scroll to last message
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // --- Auth check
  if (!user || !auth_token) {
    return (
      <main className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="text-xl font-semibold text-gray-800">
          Please login to access your messages.
        </div>
        <Link to="/auth" className="mt-4 inline-block rounded bg-blue-600 text-white px-4 py-2 hover:bg-blue-700">
          Go to Login
        </Link>
      </main>
    );
  }
  if (user.role === "admin") {
    return (
      <main className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="text-xl font-semibold text-gray-800">
          Admins do not have access to user messaging.
        </div>
      </main>
    );
  }

  // --- QueryClient for react-query
  const queryClient = useQueryClient();

  // --- Fetch message threads (sidebar)
  const {
    data: messageThreads,
    isLoading: threadsLoading,
    isError: threadsError,
    refetch: refetchThreads,
  } = useQuery<MessageThread[], Error>({
    queryKey: ["message-threads", user.user_id],
    queryFn: () => fetchMessageThreads(user.user_id, auth_token),
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
    onSuccess: (threads) => {
      // Store in zustand for global use
      set_message_threads(threads);
      // If coming in via /messages?thread_id=xyz, auto-select that on first load (if not already)
      const selectedFromUrl = searchParams.get("thread_id");
      if (selectedFromUrl && !active_thread_id) {
        const exists = threads.some((t) => t.thread_id === selectedFromUrl);
        if (exists) setActiveThreadId(selectedFromUrl);
      }
      // Default: pick first, newest thread
      if (!active_thread_id && threads.length > 0) {
        setActiveThreadId(threads[0].thread_id);
      }
    },
    onError: (err) => {
      setLocalError("Could not load message threads.");
      set_error_state({ context: "messaging", message: err.message });
    },
  });

  // --- Filtered threads for search box
  const filteredThreads = React.useMemo(() => {
    if (!messageThreads) return [];
    if (!sidebarSearch.trim()) return messageThreads;
    const term = sidebarSearch.trim().toLowerCase();
    return messageThreads.filter((t) =>
      t.participants
        .some(uid => uid !== user.user_id && uid.toLowerCase().includes(term)) ||
      (t.villa_id && t.villa_id.toLowerCase().includes(term)) ||
      (t.booking_id && t.booking_id.toLowerCase().includes(term))
    );
  }, [sidebarSearch, messageThreads, user.user_id]);

  // --- Fetch messages for active thread
  const {
    data: messages,
    isLoading: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useQuery<Message[], Error>({
    enabled: !!active_thread_id,
    queryKey: ["messages", active_thread_id, auth_token],
    queryFn: () => fetchMessagesForThread(active_thread_id!, auth_token),
    staleTime: 10 * 1000,
    onError: (err) => {
      setLocalError("Could not load messages.");
      set_error_state({ context: "messaging", message: err.message });
    },
  });

  // --- Mutation to send a message
  const sendMsgMutation = useMutation({
    mutationFn: (payload: { thread_id: string; sender_user_id: string; content: string }) =>
      sendMessage(payload, auth_token),
    onSuccess: (msg, vars) => {
      // Refetch messages and threads (for ordering, unread counts, "last message")
      queryClient.invalidateQueries({ queryKey: ["messages", vars.thread_id] });
      queryClient.invalidateQueries({ queryKey: ["message-threads", user.user_id] });
      setComposeContent(""); // Clear compose box
      reset_error_state();
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    },
    onError: (err: any) => {
      setLocalError("Could not send message.");
      set_error_state({ message: err?.message, context: "messaging" });
    },
  });

  // --- Mutation to mark message as read
  const markReadMutation = useMutation({
    mutationFn: ({ message_id }: { message_id: string }) =>
      markMessageAsRead({ message_id, token: auth_token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-threads", user.user_id] });
    },
  });

  // --- Mark all unread incoming messages as read when thread/messages change
  useEffect(() => {
    if (messages && active_thread_id) {
      messages.forEach((m) => {
        if (
          m.sender_user_id !== user.user_id &&
          !m.is_read &&
          !markingAsRead.has(m.message_id)
        ) {
          setMarkingAsRead(prev => new Set(prev).add(m.message_id));
          markReadMutation.mutate({ message_id: m.message_id });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, user.user_id, active_thread_id]);

  // --- Scroll to bottom after messages load
  useEffect(() => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }, 150);
  }, [messages, active_thread_id]);

  // --- Reset local error on thread change or input
  useEffect(() => {
    setLocalError(null);
    reset_error_state();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active_thread_id]);

  // --- Empty State
  const noThreads = !threadsLoading && (!messageThreads || messageThreads.length === 0);
  const noMessages = !messagesLoading && messages && messages.length === 0 && !noThreads;

  // --- Compose handlers
  const onChangeCompose = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setLocalError(null);
    reset_error_state();
    setComposeContent(e.target.value);
  };
  const onSendMessage = () => {
    if (
      !compose_content.trim() ||
      !active_thread_id ||
      sendMsgMutation.isPending
    )
      return;
    // Sanitize
    const content = compose_content.replace(/[\u200B-\u200D\uFEFF]/g, "").trim().slice(0, 4000);
    sendMsgMutation.mutate({
      thread_id: active_thread_id,
      sender_user_id: user.user_id,
      content,
    });
  };
  const onKeyDownCompose = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  // --- Set thread by URL param, keep it in sync
  useEffect(() => {
    const selected = searchParams.get("thread_id");
    if (selected && messageThreads && messageThreads.some((t) => t.thread_id === selected)) {
      setActiveThreadId(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, messageThreads]);

  // --- On thread change, update URL param for browser/navigation context (push)
  useEffect(() => {
    if (!active_thread_id) return;
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("thread_id", active_thread_id);
      return params;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active_thread_id]);

  // --- Sidebar thread click handler
  const handleThreadClick = (tid: string) => {
    setActiveThreadId(tid);
    setTimeout(() => {
      if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, 120);
  };

  // --- Get display info for thread: e.g., property/booking context
  const renderThreadContext = (thread: MessageThread) => {
    return (
      <span className="text-xs text-blue-700">
        {thread.villa_id && (
          <Link
            to={`/villa/${encodeURIComponent(thread.villa_id)}`}
            className="hover:underline focus:outline-none focus:ring rounded-sm"
            tabIndex={0}
          >Property</Link>
        )}
        {thread.booking_id && (
          <>
            {thread.villa_id && " | "}
            <Link
              to={`/booking/${encodeURIComponent(thread.booking_id)}`}
              className="hover:underline focus:outline-none focus:ring rounded-sm"
              tabIndex={0}
            >Booking</Link>
          </>
        )}
      </span>
    );
  };

  // --- Find thread, user meta for current thread
  const currentThread = messageThreads?.find((t) => t.thread_id === active_thread_id) || null;
  // Other participant info for header - for MVP, just user id, since FE only gets id not meta
  const otherUserId =
    currentThread?.participants &&
    getOtherParticipantUserId(currentThread.participants, user.user_id);

  return (
    <>
      <main className="flex flex-col md:flex-row w-full h-[80vh] md:h-[88vh] bg-gray-50 border rounded-lg shadow relative">
        {/* --- Sidebar */}
        <aside className="w-full md:w-80 bg-white border-r flex flex-col h-64 md:h-auto shrink-0">
          <div className="p-4 border-b bg-gray-50">
            <div className="font-semibold text-lg text-gray-700">Conversations</div>
            <input
              type="text"
              aria-label="Search threads"
              className="mt-3 w-full px-2 py-1 rounded border text-sm"
              placeholder="Search by user or property..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
            />
          </div>
          <nav className="flex-1 overflow-y-auto">
            {threadsLoading ? (
              <div className="py-8 text-center text-gray-600">Loading threads...</div>
            ) : noThreads ? (
              <div className="flex flex-col items-center mt-20">
                <img
                  src="https://picsum.photos/seed/message_empty/120/80"
                  alt=""
                  className="mb-3 rounded"
                  aria-hidden="true"
                />
                <div className="text-sm text-gray-600">No conversations found yet.</div>
              </div>
            ) : (
              <ul>
                {filteredThreads.map((thread) => {
                  const isActive = active_thread_id === thread.thread_id;
                  const otherUid = getOtherParticipantUserId(thread.participants, user.user_id);
                  return (
                    <li key={thread.thread_id}>
                      <button
                        onClick={() => handleThreadClick(thread.thread_id)}
                        className={`flex items-center w-full px-4 py-3 text-left group focus:outline-none focus:ring
                          ${isActive ? "bg-blue-50 border-l-4 border-blue-600" : "hover:bg-gray-100"}
                        `}
                        tabIndex={0}
                        aria-current={isActive ? "true" : undefined}
                        aria-label={`Conversation with user: ${otherUid || "Unknown"}`}
                      >
                        <span
                          className="inline-block w-7 h-7 rounded-full bg-blue-100 text-blue-700 mr-3 flex items-center justify-center"
                          aria-label="User avatar"
                        >
                          {/* Avatar = initials of user id (MVP: no name exposed) */}
                          {otherUid ? otherUid.slice(-2).toUpperCase() : "??"}
                        </span>
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-800 line-clamp-1">
                            {otherUid || "Unknown"}
                          </div>
                          <div className="text-xs text-gray-500 flex flex-row gap-1 items-center">
                            {renderThreadContext(thread)}
                          </div>
                        </div>
                        {thread.unread_count > 0 && (
                          <span
                            className="ml-2 bg-blue-500 text-white px-2 py-0.5 text-xs rounded-full"
                            aria-live="polite"
                            aria-label={`${thread.unread_count} unread message${thread.unread_count !== 1 ? "s" : ""}`}
                          >
                            {thread.unread_count}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
        </aside>

        {/* --- Main Thread/message panel */}
        <section className="flex-1 flex flex-col relative h-[64vh] md:h-auto">
          {/* Header */}
          <div className="px-5 py-4 bg-white border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              {otherUserId ? (
                <span
                  className="inline-flex w-10 h-10 rounded-full items-center justify-center bg-blue-100 text-blue-700 font-bold text-lg"
                  aria-label="Other participant avatar"
                >
                  {otherUserId.slice(-2).toUpperCase()}
                </span>
              ) : (
                <span
                  className="inline-flex w-10 h-10 rounded-full items-center justify-center bg-gray-200 text-gray-400"
                  aria-label="Unknown user"
                >??</span>
              )}
              <div>
                <div className="text-base text-gray-900 font-semibold line-clamp-1">{otherUserId || "Select conversation"}</div>
                {currentThread && (
                  <div className="text-xs text-blue-700 font-medium flex flex-row gap-2">
                    {renderThreadContext(currentThread)}
                  </div>
                )}
              </div>
            </div>
            {/* Add burger menu for mobile if needed */}
          </div>
          {/* Message log */}
          <section
            className="flex-1 overflow-y-auto px-3 py-4 bg-slate-50"
            tabIndex={0}
            aria-live="polite"
            aria-label="Message log"
          >
            {messagesLoading ? (
              <div className="text-gray-600 text-center py-8">Loading messages...</div>
            ) : noMessages ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No messages in this conversation yet.
              </div>
            ) : (
              <ul className="space-y-4">
                {messages &&
                  messages.map((m, i) => {
                    const isMe = m.sender_user_id === user.user_id;
                    return (
                      <li
                        key={m.message_id}
                        className={`flex items-end gap-2 ${
                          isMe ? "justify-end" : "justify-start"
                        }`}
                      >
                        {!isMe && (
                          <span
                            className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mr-1"
                            aria-label="Other participant avatar"
                          >
                            {m.sender_user_id
                              ? m.sender_user_id.slice(-2).toUpperCase()
                              : "?"}
                          </span>
                        )}
                        <div
                          className={`max-w-xs sm:max-w-sm md:max-w-md px-3 py-2 rounded-2xl shadow text-sm
                          ${
                            isMe
                              ? "bg-blue-600 text-white rounded-br-none"
                              : "bg-gray-200 text-gray-800 rounded-bl-none"
                          }
                          `}
                        >
                          {/* For accessibility, add sender + time */}
                          <span className="sr-only">
                            {isMe ? "You" : "Other participant"} at{" "}
                            {new Date(m.sent_at).toLocaleString()}
                          </span>
                          <span>{m.content}</span>
                          <span className={`block mt-1 text-xs text-right ${isMe ? "text-blue-300" : "text-gray-500"}`}>
                            {new Date(m.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {isMe && (
                          <span
                            className="w-8 h-8 rounded-full bg-blue-700 text-white flex items-center justify-center ml-1"
                            aria-label="Your avatar"
                          >
                            {user.user_id.slice(-2).toUpperCase()}
                          </span>
                        )}
                      </li>
                    );
                  })}
                {/* End marker */}
                <div ref={messagesEndRef} tabIndex={-1} aria-hidden="true"></div>
              </ul>
            )}
          </section>
          {/* Compose box */}
          {active_thread_id && (
            <form
              className="w-full border-t p-4 bg-white flex items-end gap-2"
              onSubmit={e => {
                e.preventDefault();
                onSendMessage();
              }}
              aria-label="Compose message"
            >
              <label htmlFor="compose-input" className="sr-only">
                Compose your message
              </label>
              <textarea
                id="compose-input"
                className="flex-1 rounded border px-2 py-2 mr-2 resize-none min-h-[36px] max-h-[120px] shadow"
                value={compose_content}
                onChange={onChangeCompose}
                onKeyDown={onKeyDownCompose}
                placeholder="Type a message…"
                aria-label="Message input"
                required
                disabled={sendMsgMutation.isPending}
                tabIndex={0}
                maxLength={4000}
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 ml-2 min-w-[40px] px-4 py-2 rounded font-semibold text-white flex items-center gap-1 focus:outline-none focus:ring disabled:opacity-70 disabled:cursor-not-allowed"
                aria-label="Send message"
                disabled={!compose_content.trim() || sendMsgMutation.isPending}
                tabIndex={0}
              >
                <span className="material-icons" aria-hidden="true">
                  send
                </span>
              </button>
            </form>
          )}

          {/* Local error state */}
          {(localError || error_state.has_error) && (
            <div
              className="absolute bottom-20 left-0 right-0 mx-auto w-fit rounded bg-red-100 px-4 py-2 text-sm text-red-700 border border-red-400 shadow"
              aria-live="assertive"
              aria-label="Error"
              tabIndex={0}
            >
              <span>{localError || error_state.message}</span>
              <button
                onClick={() => {
                  setLocalError(null);
                  reset_error_state();
                }}
                className="ml-4 underline text-red-600 font-bold text-xs"
                aria-label="Dismiss error"
                tabIndex={0}
                type="button"
              >
                Dismiss
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  );
};

export default UV_Messaging;