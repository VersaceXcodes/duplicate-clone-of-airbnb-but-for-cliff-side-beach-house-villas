import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";

// Zod validation types (import all types; reference only, validation is backend-side)
import {
  User,
  CreateUserInput,
  createUserInputSchema,
} from "@schema";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// --- Util Types ---
type PendingStatus =
  | { state: "idle"; error: null; message: null }
  | { state: "submitting"; error: null; message: null }
  | { state: "error"; error: string; message: null }
  | { state: "success"; error: null; message: string };

// === MAIN COMPONENT ===
const UV_Auth: React.FC = () => {
  // --- STATE -----
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // extract url params (sanitized)
  const modeParam = (searchParams.get("mode") || "login").toLowerCase();
  const resetTokenParam = searchParams.get("reset_token")?.trim() || null;
  const emailParam = searchParams.get("email")?.trim() || "";

  // local
  const [auth_flow_mode, set_auth_flow_mode] = useState<
    "login" | "register" | "forgot_password" | "reset" | "email_confirm"
  >(
    ["register", "forgot_password", "reset", "email_confirm"].includes(modeParam)
      ? (modeParam as any)
      : "login"
  );
  const [form_state, set_form_state] = useState<{
    email: string;
    password: string;
    name: string;
    role: string;
    profile_photo_url: string | null;
    terms_accepted?: boolean;
  }>({
    email: emailParam,
    password: "",
    name: "",
    role: "guest",
    profile_photo_url: null,
    terms_accepted: false,
  });

  const [pending_status, set_pending_status] = useState<PendingStatus>({
    state: "idle",
    error: null,
    message: null,
  });

  // refs for focus management
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // --- GLOBAL STATE ---
  const user = useAppStore((s) => s.user);
  const set_user = useAppStore((s) => s.set_user);
  const set_auth_token = useAppStore((s) => s.set_auth_token);
  const logout = useAppStore((s) => s.logout);

  // --- Redirect if already logged in
  useEffect(() => {
    // Block revisit if already logged in unless email confirmation or password reset
    if (
      user &&
      (auth_flow_mode === "login" ||
        auth_flow_mode === "register" ||
        auth_flow_mode === "forgot_password")
    ) {
      navigate("/", { replace: true });
    }
    // eslint-disable-next-line
  }, [user, auth_flow_mode]);

  // --- Sync mode in URL <-> local state
  useEffect(() => {
    set_auth_flow_mode(
      ["register", "forgot_password", "reset", "email_confirm"].includes(modeParam)
        ? (modeParam as any)
        : "login"
    );
    // eslint-disable-next-line
  }, [modeParam]);

  // --- Autofill from params for reset or email (e.g., after "forgot")
  useEffect(() => {
    if (emailParam) {
      set_form_state((p) => ({ ...p, email: emailParam }));
    }
  }, [emailParam]);

  // --- Mutations ---

  // LOGIN
  const loginMutation = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => {
      const { data } = await axios.post(`${API_BASE}/auth/login`, {
        email: email.trim(),
        password,
      });
      return data; // { token, user }
    },
    onMutate: () => {
      set_pending_status({ state: "submitting", error: null, message: null });
    },
    onSuccess: (data) => {
      set_user(data.user, data.token);
      set_pending_status({
        state: "success",
        error: null,
        message: "Logged in! Redirecting...",
      });
      setTimeout(() => navigate("/", { replace: true }), 600); // Go home
    },
    onError: (error: any) => {
      let errorMsg =
        error?.response?.data?.error ||
        error?.message ||
        "Login failed. Please check credentials.";
      set_pending_status({ state: "error", error: errorMsg, message: null });
    },
  });

  // REGISTER
  const registerMutation = useMutation({
    mutationFn: async (form: {
      email: string;
      password: string;
      name: string;
      role: string;
      profile_photo_url: string | null;
    }) => {
      // Validate client-side (minimal; backend does full Zod)
      if (!form.email.match(/^[\w\-.]+@[\w\-.]+\.\w+$/)) {
        throw new Error("Invalid email format");
      }
      if (!form.name || form.name.trim().length < 1) {
        throw new Error("Name is required");
      }
      if (!form.role) {
        throw new Error("Role is required");
      }
      if (!form.password || form.password.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      // Note: password is sent as 'password_hash'; API expects raw password, backend hashes.
      const payload: CreateUserInput = {
        email: form.email.trim(),
        name: form.name.trim(),
        password_hash: form.password,
        role: form.role,
        profile_photo_url: form.profile_photo_url || null,
      };
      const { data } = await axios.post(`${API_BASE}/auth/signup`, payload);
      return data; // { token, user }
    },
    onMutate: () => {
      set_pending_status({ state: "submitting", error: null, message: null });
    },
    onSuccess: (data) => {
      set_user(data.user, data.token);
      set_pending_status({
        state: "success",
        error: null,
        message:
          "Registration successful! Please check your email for a confirmation link.",
      });
      setTimeout(() => navigate("/", { replace: true }), 1000);
    },
    onError: (error: any) => {
      let errorMsg =
        error?.response?.data?.error ||
        error?.message ||
        "Registration failed.";
      set_pending_status({ state: "error", error: errorMsg, message: null });
    },
  });

  // FORGOT PASSWORD
  const forgotPasswordMutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      if (!email || !email.match(/^[\w\-.]+@[\w\-.]+\.\w+$/)) {
        throw new Error("A valid email is required");
      }
      await axios.post(`${API_BASE}/auth/forgot-password`, {
        email: email.trim(),
      });
    },
    onMutate: () => {
      set_pending_status({ state: "submitting", error: null, message: null });
    },
    onSuccess: () => {
      set_pending_status({
        state: "success",
        error: null,
        message: "If your email exists, a reset link has been sent.",
      });
    },
    onError: (error: any) => {
      let errorMsg =
        error?.response?.data?.error ||
        error?.message ||
        "Unable to send reset email.";
      set_pending_status({ state: "error", error: errorMsg, message: null });
    },
  });

  // RESET PASSWORD
  const resetPasswordMutation = useMutation({
    mutationFn: async ({
      reset_token,
      password,
    }: {
      reset_token: string;
      password: string;
    }) => {
      // Password checks
      if (!password || password.length < 8)
        throw new Error("Password must be at least 8 characters");
      if (!reset_token)
        throw new Error("Missing or invalid reset token from your email");
      const { data } = await axios.post(
        `${API_BASE}/auth/reset-password`,
        { token: reset_token, password }
      );
      return data; // { token, user }
    },
    onMutate: () => {
      set_pending_status({ state: "submitting", error: null, message: null });
    },
    onSuccess: (data) => {
      set_user(data.user, data.token);
      set_pending_status({
        state: "success",
        error: null,
        message: "Password reset! Redirecting...",
      });
      setTimeout(() => navigate("/", { replace: true }), 1000);
    },
    onError: (error: any) => {
      let errorMsg =
        error?.response?.data?.error ||
        error?.message ||
        "Reset failed. Your link may have expired.";
      set_pending_status({ state: "error", error: errorMsg, message: null });
    },
  });

  // CONFIRM EMAIL
  const confirmEmailMutation = useMutation({
    mutationFn: async ({ reset_token }: { reset_token: string }) => {
      if (!reset_token)
        throw new Error("Missing or invalid confirmation token");
      const { data } = await axios.post(
        `${API_BASE}/auth/confirm-email`,
        { token: reset_token }
      );
      return data; // { token, user }
    },
    onMutate: () => {
      set_pending_status({ state: "submitting", error: null, message: null });
    },
    onSuccess: (data) => {
      set_user(data.user, data.token);
      set_pending_status({
        state: "success",
        error: null,
        message: "Email confirmed! Redirecting...",
      });
      setTimeout(() => navigate("/", { replace: true }), 900);
    },
    onError: (error: any) => {
      let errorMsg =
        error?.response?.data?.error ||
        error?.message ||
        "The confirmation link is invalid or expired.";
      set_pending_status({ state: "error", error: errorMsg, message: null });
    },
  });

  // ---- UI Logic ---

  // clear error on input change
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    set_pending_status((ps) =>
      ps.state === "error"
        ? { state: "idle", error: null, message: null }
        : ps
    );
    const { name, value, type } = e.target;
    // Sanitize input: trim and restrict
    set_form_state((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : value.replace(/\s+/g, " ").trimStart(),
    }));
  };

  // Form Submit Handlers

  // LOGIN
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending_status.state === "submitting") return;
    loginMutation.mutate({
      email: form_state.email,
      password: form_state.password,
    });
  };

  // REGISTER
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending_status.state === "submitting") return;
    if (!form_state.terms_accepted) {
      set_pending_status({
        state: "error",
        error: "You must accept terms to register",
        message: null,
      });
      return;
    }
    registerMutation.mutate({
      email: form_state.email,
      password: form_state.password,
      name: form_state.name,
      role: form_state.role,
      profile_photo_url: form_state.profile_photo_url || null,
    });
  };

  // FORGOT PASSWORD
  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending_status.state === "submitting") return;
    forgotPasswordMutation.mutate({ email: form_state.email });
  };

  // RESET PASSWORD
  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending_status.state === "submitting") return;
    resetPasswordMutation.mutate({
      reset_token: resetTokenParam || "",
      password: form_state.password,
    });
  };

  // EMAIL CONFIRM (Button)
  const handleConfirmEmail = () => {
    if (pending_status.state === "submitting" || !resetTokenParam) return;
    confirmEmailMutation.mutate({ reset_token: resetTokenParam || "" });
  };

  // File upload for profile photo (register)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // For MVP, fake upload to picsum.photos as real hosting is out-of-scope
    const file = e.target.files?.[0];
    if (!file) return;
    // Preview/fake-upload: in real deployment, upload to storage and receive URL
    const blobUrl = URL.createObjectURL(file);
    set_form_state((prev) => ({
      ...prev,
      profile_photo_url: blobUrl,
    }));
  };

  // Mode switchers (and update url param)
  const toLogin = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setSearchParams({ mode: "login" });
  };
  const toRegister = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setSearchParams({ mode: "register" });
  };
  const toForgot = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setSearchParams({ mode: "forgot_password" });
  };

  // Focus first field on mode change
  useEffect(() => {
    setTimeout(() => {
      if (auth_flow_mode === "login" && emailRef.current) emailRef.current.focus();
      if (auth_flow_mode === "register" && emailRef.current) emailRef.current.focus();
      if (auth_flow_mode === "forgot_password" && emailRef.current) emailRef.current.focus();
      if (auth_flow_mode === "reset" && passwordRef.current) passwordRef.current.focus();
    }, 70);
    // Clear errors/messages
    set_pending_status({ state: "idle", error: null, message: null });
    set_form_state((fs) => ({
      ...fs,
      password: "",
    }));
  }, [auth_flow_mode]);

  // --- Keyboard submit-on-enter
  const formWrapperRef = useRef<HTMLDivElement>(null);

  // For accessibility: on Enter in modal, submit the form
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const el = document.activeElement as HTMLElement;
        if (
          el &&
          formWrapperRef.current &&
          formWrapperRef.current.contains(el)
        ) {
          switch (auth_flow_mode) {
            case "login":
              handleLogin(e as any);
              break;
            case "register":
              handleRegister(e as any);
              break;
            case "forgot_password":
              handleForgotPassword(e as any);
              break;
            case "reset":
              handleResetPassword(e as any);
              break;
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line
  }, [auth_flow_mode, form_state]);

  // --- Main card/container ---
  return (
    <>
      <div className="flex items-center justify-center min-h-[80vh] py-10 bg-gradient-to-b from-white to-sky-50">
        <div
          ref={formWrapperRef}
          className="min-w-[325px] w-full max-w-md rounded-xl bg-white shadow-xl p-8 transition-all"
        >
          {/* Logo + Brand Name */}
          <div className="mb-6 flex flex-col items-center">
            <img
              src="https://picsum.photos/seed/cliffbnblogo/64/64"
              alt="CliffBnb Logo"
              className="w-12 h-12 rounded-full mb-1"
            />
            <span className="text-2xl font-bold tracking-tight text-sky-700">
              CliffBnb
            </span>
            <span className="text-xs text-slate-400 tracking-wide mt-1">
              Cliff-side villas made accessible
            </span>
          </div>

          {/* --- AUTH MODES --- */}
          {auth_flow_mode === "login" && (
            <form
              aria-label="Login form"
              onSubmit={handleLogin}
              className="flex flex-col gap-4"
              tabIndex={0}
              autoComplete="on"
            >
              <div>
                <label className="block text-slate-700 mb-1" htmlFor="login_email">
                  Email Address
                </label>
                <input
                  id="login_email"
                  name="email"
                  type="email"
                  ref={emailRef}
                  required
                  inputMode="email"
                  autoComplete="email"
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-sky-400"
                  value={form_state.email}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1" htmlFor="login_password">
                  Password
                </label>
                <input
                  id="login_password"
                  name="password"
                  ref={passwordRef}
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-sky-400"
                  value={form_state.password}
                  onChange={handleInputChange}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <button
                  type="submit"
                  className={`w-full flex justify-center items-center rounded bg-sky-700 px-4 py-2 text-white font-semibold transition-all hover:bg-sky-800 ${
                    pending_status.state === "submitting" ? "opacity-80 pointer-events-none" : ""
                  }`}
                  tabIndex={0}
                  disabled={pending_status.state === "submitting"}
                  aria-label="Sign in"
                >
                  {pending_status.state === "submitting" ? (
                    <span className="animate-spin inline-block w-5 h-5 mr-2 border-b-2 border-white rounded-full"></span>
                  ) : (
                    <span className="mr-2">🔑</span>
                  )}
                  Log In / Continue
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <button
                  type="button"
                  className="underline text-sky-700 hover:text-sky-900"
                  tabIndex={0}
                  aria-label="Forgot password"
                  onClick={toForgot}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="underline text-sky-700 hover:text-sky-900"
                  tabIndex={0}
                  aria-label="Go to register"
                  onClick={toRegister}
                >
                  Create an account
                </button>
              </div>
            </form>
          )}

          {auth_flow_mode === "register" && (
            <form
              aria-label="Register form"
              onSubmit={handleRegister}
              className="flex flex-col gap-4"
              tabIndex={0}
              autoComplete="on"
            >
              <div>
                <label className="block text-slate-700 mb-1" htmlFor="register_name">
                  Name
                </label>
                <input
                  id="register_name"
                  name="name"
                  type="text"
                  required
                  autoComplete="name"
                  maxLength={255}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-sky-400"
                  value={form_state.name}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1" htmlFor="register_email">
                  Email Address
                </label>
                <input
                  id="register_email"
                  name="email"
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-sky-400"
                  value={form_state.email}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1" htmlFor="register_password">
                  Password
                </label>
                <input
                  id="register_password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-sky-400"
                  value={form_state.password}
                  onChange={handleInputChange}
                />
                <span className="text-xs text-slate-400">At least 8 characters</span>
              </div>
              <div>
                <label className="block text-slate-700 mb-1" htmlFor="register_role">
                  Account Type
                </label>
                <select
                  id="register_role"
                  name="role"
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-sky-400"
                  value={form_state.role}
                  onChange={handleInputChange}
                  required
                  tabIndex={0}
                >
                  <option value="guest">Guest (Book stays)</option>
                  <option value="host">Host (List a villa)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 mb-1" htmlFor="register_profile_photo">
                  Profile Photo (optional)
                </label>
                <input
                  id="register_profile_photo"
                  name="profile_photo_url"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="w-full py-1"
                />
                {form_state.profile_photo_url && (
                  <img
                    src={form_state.profile_photo_url}
                    alt="Profile preview"
                    className="rounded-full mt-2 w-16 h-16 object-cover border border-slate-200"
                  />
                )}
              </div>
              <div className="flex items-center mt-1">
                <input
                  type="checkbox"
                  id="terms_accepted"
                  name="terms_accepted"
                  checked={!!form_state.terms_accepted}
                  onChange={handleInputChange}
                  className="mr-2"
                  required
                />
                <label htmlFor="terms_accepted" className="text-xs text-slate-500">
                  I agree to the
                  <Link
                    to="/info/terms"
                    className="underline ml-1"
                    tabIndex={0}
                  >
                    Terms of Service
                  </Link>
                  {" "}and{" "}
                  <Link
                    to="/info/privacy"
                    className="underline"
                    tabIndex={0}
                  >
                    Privacy Policy
                  </Link>
                </label>
              </div>
              <button
                type="submit"
                className={`w-full flex justify-center items-center rounded bg-sky-700 px-4 py-2 text-white font-semibold transition-all hover:bg-sky-800 ${
                  pending_status.state === "submitting" ? "opacity-80 pointer-events-none" : ""
                }`}
                tabIndex={0}
                disabled={pending_status.state === "submitting"}
                aria-label="Sign up"
              >
                {pending_status.state === "submitting" ? (
                  <span className="animate-spin inline-block w-5 h-5 mr-2 border-b-2 border-white rounded-full"></span>
                ) : (
                  <span className="mr-2">👤</span>
                )}
                Sign Up
              </button>
              <div className="text-xs flex justify-between mt-2">
                <button
                  type="button"
                  className="underline text-sky-700 hover:text-sky-900"
                  tabIndex={0}
                  aria-label="Go to login"
                  onClick={toLogin}
                >
                  Already have an account?
                </button>
              </div>
            </form>
          )}

          {auth_flow_mode === "forgot_password" && (
            <form
              aria-label="Forgot password form"
              onSubmit={handleForgotPassword}
              className="flex flex-col gap-4"
              tabIndex={0}
            >
              <div>
                <label className="block text-slate-700 mb-1" htmlFor="forgot_email">
                  Enter your email address
                </label>
                <input
                  id="forgot_email"
                  name="email"
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-sky-400"
                  value={form_state.email}
                  onChange={handleInputChange}
                  ref={emailRef}
                />
              </div>
              <button
                type="submit"
                className={`w-full flex justify-center items-center rounded bg-sky-700 px-4 py-2 text-white font-semibold transition-all hover:bg-sky-800 ${
                  pending_status.state === "submitting" ? "opacity-80 pointer-events-none" : ""
                }`}
                tabIndex={0}
                disabled={pending_status.state === "submitting"}
                aria-label="Request password reset"
              >
                {pending_status.state === "submitting" ? (
                  <span className="animate-spin inline-block w-5 h-5 mr-2 border-b-2 border-white rounded-full"></span>
                ) : (
                  <span className="mr-2">📧</span>
                )}
                Send Reset Link
              </button>
              <div className="text-xs flex justify-between mt-2">
                <button
                  type="button"
                  className="underline text-sky-700 hover:text-sky-900"
                  tabIndex={0}
                  aria-label="Go to login"
                  onClick={toLogin}
                >
                  Back to login
                </button>
                <button
                  type="button"
                  className="underline text-sky-700 hover:text-sky-900"
                  tabIndex={0}
                  aria-label="Go to register"
                  onClick={toRegister}
                >
                  Register
                </button>
              </div>
            </form>
          )}

          {auth_flow_mode === "reset" && (
            <form
              aria-label="Reset password form"
              onSubmit={handleResetPassword}
              className="flex flex-col gap-4"
              tabIndex={0}
            >
              <div>
                <label className="block text-slate-700 mb-1" htmlFor="reset_password">
                  New Password
                </label>
                <input
                  id="reset_password"
                  ref={passwordRef}
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-sky-400"
                  value={form_state.password}
                  onChange={handleInputChange}
                />
                <span className="text-xs text-slate-400">At least 8 characters</span>
              </div>
              <button
                type="submit"
                className={`w-full flex justify-center items-center rounded bg-sky-700 px-4 py-2 text-white font-semibold transition-all hover:bg-sky-800 ${
                  pending_status.state === "submitting" ? "opacity-80 pointer-events-none" : ""
                }`}
                tabIndex={0}
                disabled={pending_status.state === "submitting"}
                aria-label="Set new password"
              >
                {pending_status.state === "submitting" ? (
                  <span className="animate-spin inline-block w-5 h-5 mr-2 border-b-2 border-white rounded-full"></span>
                ) : (
                  <span className="mr-2">🔒</span>
                )}
                Set New Password
              </button>
              <div className="text-xs flex justify-between mt-2">
                <button
                  type="button"
                  className="underline text-sky-700 hover:text-sky-900"
                  tabIndex={0}
                  aria-label="Go to login"
                  onClick={toLogin}
                >
                  Back to login
                </button>
              </div>
            </form>
          )}

          {auth_flow_mode === "email_confirm" && (
            <div>
              <div className="flex flex-col items-center mt-5 mb-4">
                <span className="text-lg font-semibold text-sky-700 mb-2">
                  Email Confirmation
                </span>
                <span className="text-sm text-slate-600 text-center max-w-sm">
                  Please confirm your email address to complete registration and unlock all site features.
                </span>
              </div>
              <button
                type="button"
                className={`w-full flex justify-center items-center rounded bg-sky-700 px-4 py-2 text-white font-semibold transition-all hover:bg-sky-800 ${
                  pending_status.state === "submitting" ? "opacity-80 pointer-events-none" : ""
                }`}
                tabIndex={0}
                disabled={pending_status.state === "submitting" || !resetTokenParam}
                aria-label="Confirm email"
                onClick={handleConfirmEmail}
              >
                {pending_status.state === "submitting" ? (
                  <span className="animate-spin inline-block w-5 h-5 mr-2 border-b-2 border-white rounded-full"></span>
                ) : (
                  <span className="mr-2">📧</span>
                )}
                Confirm Email
              </button>
              <div className="mt-4 text-xs text-center">
                <button
                  type="button"
                  className="underline text-sky-700 hover:text-sky-900"
                  tabIndex={0}
                  aria-label="Go to login"
                  onClick={toLogin}
                >
                  Back to login
                </button>
              </div>
            </div>
          )}

          {/* --- Error and success feedback --- */}
          <div
            aria-live="polite"
            className="mt-6 min-h-[28px] flex items-center justify-center"
          >
            {pending_status.state === "error" && (
              <div className="w-full px-3 py-2 bg-red-100 text-red-700 rounded text-sm text-center font-semibold">
                {pending_status.error}
              </div>
            )}
            {pending_status.state === "success" && (
              <div className="w-full px-3 py-2 bg-green-100 text-green-700 rounded text-sm text-center font-semibold">
                {pending_status.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default UV_Auth;