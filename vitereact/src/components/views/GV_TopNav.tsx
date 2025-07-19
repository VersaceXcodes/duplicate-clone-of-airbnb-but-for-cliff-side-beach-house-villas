import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";

// ----- Types/Schema Import -----
import { z } from "zod";
import {
  userSchema,
  villaSavedSchema,
  type User,
  type VillaSaved,
} from "@schema";

// ---- API base url (per conventions) ----
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// Util: role-labelling for toggler
const displayRole = (role: string | null) => {
  if (role === "host") return "Host";
  if (role === "guest") return "Guest";
  return "";
};

const GV_TopNav: React.FC = () => {
  // ---- Zustand Selectors ----
  const user = useAppStore((s) => s.user);
  const savedVillaIdsStore = useAppStore((s) => s.saved_villa_ids);
  const set_saved_villa_ids = useAppStore((s) => s.set_saved_villa_ids);
  const logoutStore = useAppStore((s) => s.logout);
  const auth_token = useAppStore((s) => s.auth_token);

  // ---- Router ----
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // ---- State ----
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [roleMutationLoading, setRoleMutationLoading] = useState(false);

  // To support keyboard/modal closing
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Nav highlight logic (basic)
  const sectionFromPath = (pathname: string) => {
    if (pathname === "/") return "home";
    if (pathname.startsWith("/search")) return "search";
    if (pathname.startsWith("/villa/")) return "villa";
    if (pathname.startsWith("/saved-villas")) return "saved";
    if (pathname.startsWith("/dashboard/guest")) return "guest-dashboard";
    if (pathname.startsWith("/dashboard/host")) return "host-dashboard";
    if (pathname.startsWith("/messages")) return "messages";
    if (pathname.startsWith("/reviews")) return "reviews";
    if (pathname.startsWith("/auth")) return "auth";
    return "";
  };
  const currentSection = sectionFromPath(pathname);

  // Fetch saved villas for guest badge (keep up to date on login/role switch)
  const fetchSavedVillas = async (): Promise<VillaSaved[]> => {
    if (!user || !user.user_id) return [];
    const { data } = await axios.get(
      `${API_BASE}/villa-saved`,
      {
        params: { user_id: user.user_id },
        headers: { Authorization: `Bearer ${auth_token}` },
      }
    );
    // Validate structure
    const arr = Array.isArray(data) ? data : [];
    return arr.map((item) => villaSavedSchema.parse(item)); // type safety
  };

  const {
    data: savedVillasData,
    refetch: refetchSavedVillas,
    isLoading: savedVillasLoading,
  } = useQuery<VillaSaved[]>(
    ["saved-villas", user?.user_id],
    fetchSavedVillas,
    {
      enabled: !!user && user.role === "guest",
      onSuccess: (villaSaves) => {
        // set ZUstand (used as cached state in app)
        set_saved_villa_ids(villaSaves.map((v) => v.villa_id));
      },
      refetchOnWindowFocus: false,
    }
  );

  // -- Keep Zustand store in sync with backend changes
  useEffect(() => {
    if (
      user &&
      user.role === "guest" &&
      savedVillasData &&
      Array.isArray(savedVillasData)
    ) {
      const idsFromServer = savedVillasData.map((v) => v.villa_id);
      if (
        savedVillaIdsStore.length !== idsFromServer.length ||
        !savedVillaIdsStore.every((id) => idsFromServer.includes(id))
      ) {
        set_saved_villa_ids(idsFromServer);
      }
    }
  }, [user, savedVillasData, savedVillaIdsStore, set_saved_villa_ids]);

  // --- Handle LOGOUT: POST /auth/logout + Zustand clear + redirect
  const logoutMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      await axios.post(
        `${API_BASE}/auth/logout`,
        {},
        { headers: { Authorization: `Bearer ${auth_token}` } }
      );
    },
    onSuccess: () => {
      logoutStore();
      setProfileOpen(false);
      navigate("/auth", { replace: true });
    },
    onError: (error) => {
      setErrorMsg(error.message || "Logout failed");
    },
  });

  // -- Handle ROLE SWITCH (guest <-> host): PATCH /users/{user_id}
  const queryClient = useQueryClient();
  const roleSwitchMutation = useMutation<
    User,
    Error,
    { newRole: string }
  >({
    mutationFn: async ({ newRole }) => {
      if (!user?.user_id) throw new Error("No user_id available");
      setRoleMutationLoading(true);
      const payload = { user_id: user.user_id, role: newRole };
      const { data } = await axios.patch(
        `${API_BASE}/users/${user.user_id}`,
        payload,
        { headers: { Authorization: `Bearer ${auth_token}` } }
      );
      // Validate structure
      return userSchema.parse(data);
    },
    onSuccess: (updatedUser) => {
      // Update Zustand
      useAppStore.getState().set_user(updatedUser, auth_token);
      setRoleMutationLoading(false);
      // Invalidate relevant queries (guest dashboard, saved, etc)
      queryClient.invalidateQueries(["saved-villas", updatedUser.user_id]);
      setProfileOpen(false);
      // Redirect to new dashboard
      if (updatedUser.role === "host") {
        navigate("/dashboard/host");
      } else if (updatedUser.role === "guest") {
        navigate("/dashboard/guest");
      }
    },
    onError: (error) => {
      setRoleMutationLoading(false);
      setErrorMsg(error.message || "Failed to switch role");
    },
  });

  // -- Mobile menu: close on route change/blur
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  // -- Close on click outside profile dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      window.addEventListener("mousedown", handleClickOutside);
    }
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [profileOpen]);

  // -- Keyboard navigation for profile dropdown
  const handleProfileDropdownKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      setProfileOpen((prev) => !prev);
    }
    if (e.key === "Escape") {
      setProfileOpen(false);
    }
  };

  // -- Helper: guest/host dual role toggler
  const canDualRoleToggle =
    user &&
    // Only show toggler if user can be both guest or host
    (user.role === "guest" || user.role === "host") &&
    // For MVP, we allow user to switch role freely (business-logic dependent)
    true;

  // -- Helper: nav link styling
  const navLinkClass = (name: string) =>
    `flex items-center h-12 px-3 text-base font-medium transition border-b-2 ${
      currentSection === name
        ? "border-blue-600 text-blue-600"
        : "border-transparent text-gray-700 hover:text-blue-600 hover:border-blue-400"
    }`;

  // -- Helper: mobile nav show/hide
  const showMobileMenu = mobileMenuOpen ? "block" : "hidden";

  // -- Helper: icon image fallback
  const avatar = user?.profile_photo_url || `https://picsum.photos/seed/avatar${user?.user_id || "0"}/40/40`;

  // -- Helper: badge counter/indicator
  const savedCount =
    user?.role === "guest"
      ? savedVillaIdsStore.length
      : 0;

  // -- Helper: Unread badge
  const hasUnreadMsg = user?.has_unread_messages;
  const hasUnreadNotif = user?.has_unread_notifications;

  // -- Helper: in case error, live region
  const errorRegionRef = useRef<HTMLDivElement>(null);

  // ---- MAIN RENDER ----
  return (
    <>
      {/* Accessibility: error (logout, role switch) */}
      <div role="alert" aria-live="polite" className={`sr-only`} ref={errorRegionRef}>
        {errorMsg}
      </div>
      {/* TopNav container */}
      <nav className="w-full shadow-sm z-40 fixed top-0 left-0 bg-white transition flex flex-row items-stretch justify-between px-4 md:px-8 h-16 border-b border-gray-100">
        {/* Left logo and brand */}
        <div className="flex items-center h-full">
          <Link to="/" aria-label="Home">
            <span className="flex items-center gap-2">
              {/* SVG logo */}
              <svg
                width={36}
                height={36}
                viewBox="0 0 40 40"
                fill="none"
                className="mr-1 text-blue-600"
                aria-hidden="true"
              >
                <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2.5" />
                <path
                  d="M10 25 L20 13 L30 25"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
                <circle cx="20" cy="24.5" r="2.5" fill="currentColor" />
              </svg>
              <span className="text-lg font-bold tracking-tight text-blue-700">
                CliffBnb
              </span>
            </span>
          </Link>
        </div>
        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-2 h-full ml-8 flex-1">
          {/* Primary nav links */}
          <Link
            to="/"
            className={navLinkClass("home")}
            aria-current={currentSection === "home" ? "page" : undefined}
          >
            Home
          </Link>
          <Link
            to="/search"
            className={navLinkClass("search")}
            aria-current={currentSection === "search" ? "page" : undefined}
          >
            Search
          </Link>
          {user?.role === "guest" && (
            <Link
              to="/saved-villas"
              className={navLinkClass("saved")}
              aria-current={currentSection === "saved" ? "page" : undefined}
            >
              Saved Villas
              {savedCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-blue-600 rounded-full" aria-label={`${savedCount} saved villas`}>
                  {savedCount}
                </span>
              )}
            </Link>
          )}
          {/* Dashboard link - role-based */}
          {(user?.role === "guest" || user?.role === "host") && (
            <Link
              to={user.role === "host" ? "/dashboard/host" : "/dashboard/guest"}
              className={navLinkClass(
                user.role === "host" ? "host-dashboard" : "guest-dashboard"
              )}
              aria-current={
                currentSection === (user.role === "host" ? "host-dashboard" : "guest-dashboard") ? "page" : undefined
              }
            >
              Dashboard
            </Link>
          )}
          {/* Messaging */}
          {user && (
            <Link
              to="/messages"
              className={navLinkClass("messages")}
              aria-current={currentSection === "messages" ? "page" : undefined}
            >
              <span className="relative inline-flex items-center">
                <svg
                  className="w-5 h-5 mr-1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 8h10M7 12h5m-5 4h7m-7-8v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H9a2 2 0 00-2 2z"
                  />
                </svg>
                Messages
                {hasUnreadMsg && (
                  <span className="absolute -top-1 -right-3 w-2 h-2 bg-red-500 rounded-full" aria-label="Unread messages"></span>
                )}
              </span>
            </Link>
          )}
          {/* Reviews (show only if logged in) */}
          {user && (
            <Link
              to="/reviews"
              className={navLinkClass("reviews")}
              aria-current={currentSection === "reviews" ? "page" : undefined}
            >
              Reviews
            </Link>
          )}
        </div>
        {/* Dual Role Toggler: guest/host only */}
        {canDualRoleToggle && (
          <div className="hidden md:flex items-center mx-3">
            <label className="flex items-center gap-1 text-sm font-medium cursor-pointer" title="Switch between Host/Guest">
              <span className={user?.role === "guest" ? "text-blue-600" : "text-gray-400"}>
                Guest
              </span>
              <button
                type="button"
                aria-label="Switch user role"
                disabled={roleMutationLoading}
                aria-disabled={roleMutationLoading}
                className={`relative w-10 h-6 focus:outline-none mx-1 ${roleMutationLoading ? "opacity-70 pointer-events-none" : ""}`}
                onClick={() => {
                  if (user && (user.role === "host" || user.role === "guest")) {
                    roleSwitchMutation.mutate({
                      newRole: user.role === "host" ? "guest" : "host",
                    });
                  }
                }}
              >
                <span
                  className={`absolute left-0 top-0 w-full h-full rounded-full transition ${
                    user.role === "host"
                      ? "bg-blue-600"
                      : "bg-gray-200"
                  }`}
                ></span>
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white border-2 transition ${
                    user.role === "host"
                      ? "translate-x-4 border-blue-600"
                      : "translate-x-0 border-gray-400"
                  }`}
                ></span>
              </button>
              <span className={user?.role === "host" ? "text-blue-600" : "text-gray-400"}>
                Host
              </span>
            </label>
          </div>
        )}
        {/* Mobile menu button */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            aria-label="Open main menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="cliffbnb-mobile-nav"
            className="inline-flex items-center justify-center p-1 rounded-md text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 8h16M4 16h16"
                />
              )}
            </svg>
          </button>
        </div>
        {/* Profile/account dropdown */}
        <div className="relative ml-3 flex items-center">
          {user ? (
            <>
              <button
                className="flex items-center gap-2 focus:outline-none"
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                onClick={() => setProfileOpen((open) => !open)}
                onKeyDown={handleProfileDropdownKey}
                tabIndex={0}
                id="user-menu-button"
                type="button"
              >
                <img
                  src={avatar}
                  alt="Profile avatar"
                  className="w-9 h-9 rounded-full border border-gray-300 object-cover"
                  referrerPolicy="no-referrer"
                />
                <span className="sr-only">{user.name || "Profile"}</span>
                {hasUnreadNotif && (
                  <span className="ml-1 w-2 h-2 bg-red-500 rounded-full" aria-label="Unread notifications"></span>
                )}
              </button>
              {/* Dropdown */}
              {profileOpen && (
                <div
                  ref={profileDropdownRef}
                  className="absolute right-0 mt-2 w-52 bg-white rounded shadow-sm border border-gray-100 z-50"
                  tabIndex={-1}
                  role="menu"
                  aria-label="Account dropdown"
                >
                  <div className="px-3 py-2 border-b border-gray-50 text-sm">
                    <div className="font-semibold truncate">{user.name}</div>
                    <div className="text-xs text-gray-500 truncate">{user.email}</div>
                  </div>
                  <Link
                    to={user.role === "host" ? "/dashboard/host" : "/dashboard/guest"}
                    className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 focus:bg-blue-100"
                    role="menuitem"
                    aria-label="Dashboard"
                    tabIndex={0}
                    onClick={() => setProfileOpen(false)}
                  >
                    Dashboard
                  </Link>
                  {user.role === "guest" && (
                    <Link
                      to="/saved-villas"
                      className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 focus:bg-blue-100"
                      role="menuitem"
                      aria-label="Saved Villas"
                      tabIndex={0}
                      onClick={() => setProfileOpen(false)}
                    >
                      Saved Villas
                      {savedCount > 0 && (
                        <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-semibold bg-blue-600 text-white rounded-full">
                          {savedCount}
                        </span>
                      )}
                    </Link>
                  )}
                  <Link
                    to="/messages"
                    className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 focus:bg-blue-100"
                    role="menuitem"
                    aria-label="Messages"
                    tabIndex={0}
                    onClick={() => setProfileOpen(false)}
                  >
                    Messages
                    {hasUnreadMsg && (
                      <span className="ml-2 inline-flex w-2 h-2 bg-red-500 rounded-full"></span>
                    )}
                  </Link>
                  <Link
                    to="/reviews"
                    className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 focus:bg-blue-100"
                    role="menuitem"
                    aria-label="Reviews"
                    tabIndex={0}
                    onClick={() => setProfileOpen(false)}
                  >
                    Reviews
                  </Link>
                  <button
                    type="button"
                    className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 focus:bg-blue-100"
                    tabIndex={0}
                    onClick={() => {
                      setProfileOpen(false);
                      logoutMutation.mutate();
                    }}
                    role="menuitem"
                    aria-label="Log out"
                  >
                    Log Out
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* If not logged in: show Signup/Login */}
              <Link
                to="/auth?mode=register"
                className="px-4 py-2 text-sm text-blue-700 font-semibold hover:underline rounded focus:outline-none border-none"
              >
                Sign Up
              </Link>
              <Link
                to="/auth?mode=login"
                className="px-4 py-2 text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 font-semibold rounded border border-blue-100 ml-1 focus:outline-none"
              >
                Log In
              </Link>
            </>
          )}
        </div>
      </nav>
      {/* Mobile Nav Panel */}
      <div
        id="cliffbnb-mobile-nav"
        className={`md:hidden bg-white fixed w-full top-16 left-0 shadow-lg z-30 border-b border-gray-100 transition-all duration-150 ease-in-out ${showMobileMenu}`}
      >
        <div className="flex flex-col space-y-2 pt-2 pb-4 px-4">
          <Link
            to="/"
            className={navLinkClass("home")}
            aria-current={currentSection === "home" ? "page" : undefined}
            onClick={() => setMobileMenuOpen(false)}
          >
            Home
          </Link>
          <Link
            to="/search"
            className={navLinkClass("search")}
            aria-current={currentSection === "search" ? "page" : undefined}
            onClick={() => setMobileMenuOpen(false)}
          >
            Search
          </Link>
          {user?.role === "guest" && (
            <Link
              to="/saved-villas"
              className={navLinkClass("saved")}
              aria-current={currentSection === "saved" ? "page" : undefined}
              onClick={() => setMobileMenuOpen(false)}
            >
              Saved Villas
              {savedCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-blue-600 rounded-full" aria-label={`${savedCount} saved villas`}>
                  {savedCount}
                </span>
              )}
            </Link>
          )}
          {/* Dashboard */}
          {(user?.role === "host" || user?.role === "guest") && (
            <Link
              to={user.role === "host" ? "/dashboard/host" : "/dashboard/guest"}
              className={navLinkClass(
                user.role === "host" ? "host-dashboard" : "guest-dashboard"
              )}
              aria-current={
                currentSection === (user.role === "host" ? "host-dashboard" : "guest-dashboard") ? "page" : undefined
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              Dashboard
            </Link>
          )}
          {/* Messages */}
          {user && (
            <Link
              to="/messages"
              className={navLinkClass("messages")}
              aria-current={currentSection === "messages" ? "page" : undefined}
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="relative inline-flex items-center">
                <svg
                  className="w-5 h-5 mr-1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 8h10M7 12h5m-5 4h7m-7-8v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H9a2 2 0 00-2 2z"
                  />
                </svg>
                Messages
                {hasUnreadMsg && (
                  <span className="absolute -top-1 -right-3 w-2 h-2 bg-red-500 rounded-full" aria-label="Unread messages"></span>
                )}
              </span>
            </Link>
          )}
          {/* Reviews */}
          {user && (
            <Link
              to="/reviews"
              className={navLinkClass("reviews")}
              aria-current={currentSection === "reviews" ? "page" : undefined}
              onClick={() => setMobileMenuOpen(false)}
            >
              Reviews
            </Link>
          )}
          {/* Dual Role Toggler */}
          {canDualRoleToggle && (
            <div className="w-full flex items-center py-2 px-2">
              <label className="flex items-center gap-1 text-sm font-medium cursor-pointer" title="Switch between Host/Guest">
                <span className={user?.role === "guest" ? "text-blue-600" : "text-gray-400"}>
                  Guest
                </span>
                <button
                  type="button"
                  aria-label="Switch user role"
                  disabled={roleMutationLoading}
                  aria-disabled={roleMutationLoading}
                  className={`relative w-10 h-6 focus:outline-none mx-1 ${roleMutationLoading ? "opacity-70 pointer-events-none" : ""}`}
                  onClick={() => {
                    if (user && (user.role === "host" || user.role === "guest")) {
                      roleSwitchMutation.mutate({
                        newRole: user.role === "host" ? "guest" : "host",
                      });
                    }
                  }}
                >
                  <span
                    className={`absolute left-0 top-0 w-full h-full rounded-full transition ${
                      user.role === "host"
                        ? "bg-blue-600"
                        : "bg-gray-200"
                    }`}
                  ></span>
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white border-2 transition ${
                      user.role === "host"
                        ? "translate-x-4 border-blue-600"
                        : "translate-x-0 border-gray-400"
                    }`}
                  ></span>
                </button>
                <span className={user?.role === "host" ? "text-blue-600" : "text-gray-400"}>
                  Host
                </span>
              </label>
            </div>
          )}
          {/* Profile or Auth Options */}
          <div className="w-full flex items-center pt-2">
            {user ? (
              <button
                className="w-full flex items-center px-3 py-2 gap-2 text-base text-gray-700 bg-blue-50 rounded hover:bg-blue-100 focus:outline-none"
                aria-label="Log out"
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logoutMutation.mutate();
                }}
              >
                Log Out
              </button>
            ) : (
              <>
                <Link
                  to="/auth?mode=register"
                  className="w-full px-3 py-2 text-base text-blue-700 hover:underline rounded focus:outline-none"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign Up
                </Link>
                <Link
                  to="/auth?mode=login"
                  className="w-full px-3 py-2 text-base text-blue-700 bg-blue-50 hover:bg-blue-100 font-semibold rounded border border-blue-100 mt-1 focus:outline-none"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Log In
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default GV_TopNav;