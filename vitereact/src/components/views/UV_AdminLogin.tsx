import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/main";

// Admin branding colors/icons
const ADMIN_BRAND_COLOR = "bg-[#204971]";
const ADMIN_ACCENT_COLOR = "text-[#318acf]";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: {
    user_id: string;
    email: string;
    name: string;
    role: string;
    profile_photo_url: string | null;
    contact_info: string | null;
    host_bio: string | null;
    is_email_confirmed: boolean;
    email_confirmation_token?: string | null;
    password_reset_token?: string | null;
    has_unread_messages: boolean;
    has_unread_notifications: boolean;
    created_at?: string;
    updated_at?: string;
  };
}

interface ForgotPasswordRequest {
  email: string;
}

const UV_AdminLogin: React.FC = () => {
  // Local state
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [auth_error, setAuthError] = useState<string | null>(null);
  const [forgot_sent, setForgotSent] = useState<false | "success" | "error">(false);

  // Zustand selectors
  const set_user = useAppStore((s) => s.set_user);
  const set_loader_state = useAppStore((s) => s.set_loader_state);
  const reset_loader_state = useAppStore((s) => s.reset_loader_state);
  const loader_state = useAppStore((s) => s.loader_state);

  const navigate = useNavigate();

  // For focusing
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Loader spinner overlay
  const isLoading = loader_state.is_loading && loader_state.context === "admin_login";

  // ------------------ LOGIN MUTATION ------------------------
  const loginMutation = useMutation({
    mutationFn: async (payload: LoginRequest): Promise<LoginResponse> => {
      const { data } = await axios.post<LoginResponse>(
        `${API_BASE}/auth/login`,
        {
          email: payload.email.trim(),
          password: payload.password,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return data;
    },
    onMutate: () => {
      set_loader_state({ is_loading: true, context: "admin_login" });
      setAuthError(null);
    },
    onSuccess: (data) => {
      // Restrict to admin login ONLY
      if (!data.user || data.user.role !== "admin") {
        setAuthError("Only admins are allowed. Use the admin account.");
        reset_loader_state();
        return;
      }
      set_user(
        {
          ...data.user,
          // Ensure type safety and structure
          profile_photo_url: data.user.profile_photo_url,
          contact_info: data.user.contact_info,
          host_bio: data.user.host_bio,
          is_email_confirmed: !!data.user.is_email_confirmed,
          has_unread_messages: !!data.user.has_unread_messages,
          has_unread_notifications: !!data.user.has_unread_notifications,
        },
        data.token
      );
      reset_loader_state();
      navigate("/admin", { replace: true });
    },
    onError: (error: any) => {
      let msg = "Login failed. Please check credentials and try again.";
      if (
        error?.response?.data?.error &&
        typeof error.response.data.error === "string"
      ) {
        // Map backend error messages to clean UI errors
        if (
          error.response.data.error === "Invalid credentials" ||
          error.response.data.error === "Email not confirmed"
        ) {
          msg = "Invalid email or password, or email not confirmed.";
        } else {
          msg = error.response.data.error;
        }
      }
      setAuthError(msg);
      reset_loader_state();
    },
  });

  // ------------------ FORGOT PASSWORD MUTATION ------------------------
  const forgotPasswordMutation = useMutation({
    mutationFn: async (payload: ForgotPasswordRequest) => {
      await axios.post(
        `${API_BASE}/auth/forgot-password`,
        { email: payload.email.trim() },
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    },
    onMutate: () => {
      set_loader_state({ is_loading: true, context: "admin_forgot_password" });
      setAuthError(null);
      setForgotSent(false);
    },
    onSuccess: () => {
      setForgotSent("success");
      reset_loader_state();
    },
    onError: () => {
      setForgotSent("error");
      reset_loader_state();
    },
  });

  // Handle enter to submit and accessibility focus
  useEffect(() => {
    if (emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, []);

  // Sanitize onChange and clear errors on change
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthError(null);
    setForgotSent(false);
    setEmail(e.target.value.trimStart());
  };
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthError(null);
    setForgotSent(false);
    setPassword(e.target.value);
  };

  // Submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setForgotSent(false);
    if (!email.trim() || !password) {
      setAuthError("Please enter both email and password.");
      return;
    }
    loginMutation.mutate({ email: email.trim(), password });
  };

  // Forgot password handler
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setForgotSent(false);
    if (!email.trim()) {
      setAuthError("Please enter your email above first.");
      return;
    }
    forgotPasswordMutation.mutate({ email: email.trim() });
  };

  return (
    <>
      {/* Distinct admin login background */}
      <div
        className={`min-h-screen flex flex-col justify-center items-center ${ADMIN_BRAND_COLOR} px-4 py-6`}
        aria-label="CliffBnb Admin Panel Login"
      >
        {/* Admin Panel Branding */}
        <div
          className={
            "w-full max-w-md rounded-xl shadow-lg bg-white flex flex-col items-center py-10 px-8 relative border-2 border-[#dbeafe]"
          }
        >
          <div className="flex flex-col items-center w-full mb-6">
            {/* SVG logo or emoji for admin */}
            <div className="rounded-full bg-[#204971] flex items-center justify-center w-14 h-14 mb-2 shadow">
              <span
                role="img"
                aria-label="Shield Lock"
                className="text-2xl text-white"
              >
                🛡️
              </span>
            </div>
            <h1
              className={`font-bold text-2xl ${ADMIN_ACCENT_COLOR} mb-1 text-center tracking-tight`}
            >
              CliffBnb Admin Panel
            </h1>
            <div className="text-gray-500 text-sm text-center">
              Moderation &amp; Platform Tools Login
            </div>
          </div>

          <form
            className="flex flex-col gap-4 items-stretch w-full"
            method="POST"
            autoComplete="off"
            spellCheck={false}
            onSubmit={handleSubmit}
            aria-label="Admin Login Form"
          >
            {/* Email */}
            <label htmlFor="admin-login-email" className="block">
              <span className="block mb-1 font-medium text-gray-700">Email</span>
              <input
                type="email"
                id="admin-login-email"
                ref={emailInputRef}
                tabIndex={1}
                required
                autoCorrect="off"
                autoCapitalize="off"
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#318acf] focus:border-[#318acf] disabled:bg-slate-100"
                placeholder="admin@cliffbnb.com"
                value={email}
                onChange={handleEmailChange}
                aria-label="Admin Email Address"
                aria-required="true"
                aria-invalid={!!auth_error}
                disabled={isLoading}
                autoFocus
              />
            </label>
            {/* Password */}
            <label htmlFor="admin-login-password" className="block">
              <span className="block mb-1 font-medium text-gray-700">Password</span>
              <input
                type="password"
                id="admin-login-password"
                tabIndex={2}
                required
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#318acf] focus:border-[#318acf] disabled:bg-slate-100"
                placeholder="••••••••"
                value={password}
                onChange={handlePasswordChange}
                aria-label="Admin Password"
                aria-required="true"
                aria-invalid={!!auth_error}
                disabled={isLoading}
              />
            </label>
            {/* Error messages */}
            {auth_error && (
              <div
                className="text-red-600 text-sm mt-1 mb-2 font-semibold"
                role="alert"
                aria-live="polite"
              >
                {auth_error}
              </div>
            )}

            {/* Login button + spinner */}
            <button
              type="submit"
              tabIndex={3}
              className={`w-full py-2 px-4 rounded bg-[#204971] text-white text-base font-semibold hover:bg-[#276199] transition-colors focus:outline-none focus:ring-2 focus:ring-[#318acf] focus:ring-offset-2 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              aria-busy={isLoading}
              disabled={isLoading}
              aria-label="Admin Login"
            >
              {isLoading ? (
                <svg
                  className="animate-spin h-5 w-5 mr-1 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  role="presentation"
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
                    d="M4 12a8 8 0 018-8v8H4z"
                  ></path>
                </svg>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Forgot password section */}
          <form
            className="flex flex-col items-center mt-6 w-full"
            onSubmit={handleForgotPassword}
            aria-label="Forgot Password Section"
            tabIndex={4}
          >
            <button
              type="submit"
              className="text-[#318acf] text-sm font-medium underline underline-offset-2 px-2 py-1 transition hover:text-[#1d70b8] mt-1 mb-1"
              disabled={isLoading || forgotPasswordMutation.isLoading}
              aria-label="Send admin password reset link"
              tabIndex={4}
            >
              Forgot password?
            </button>
            {forgot_sent === "success" && (
              <div
                className="text-green-700 bg-green-50 px-2 py-1 rounded text-xs mt-2"
                role="status"
                aria-live="polite"
              >
                If this email exists, a reset link was sent!
              </div>
            )}
            {forgot_sent === "error" && (
              <div
                className="text-red-600 text-xs mt-2"
                role="alert"
                aria-live="polite"
              >
                Error sending reset, please try again.
              </div>
            )}
          </form>

          {/* Divider */}
          <div className="mt-8 w-full border-t border-gray-200" />

          {/* Security/notice */}
          <div className="text-xs text-gray-400 mt-5 text-center w-full">
            For authorized CliffBnb operators only.<br />
            Regular users: <span className="font-semibold text-gray-500">do not log in here.</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default UV_AdminLogin;