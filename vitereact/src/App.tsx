import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Shared app/global UI elements
import GV_TopNav from "@/components/views/GV_TopNav.tsx";
import GV_Footer from "@/components/views/GV_Footer.tsx";
import GV_NotificationToaster from "@/components/views/GV_NotificationToaster.tsx";
import GV_LoaderSpinner from "@/components/views/GV_LoaderSpinner.tsx";
import GV_ErrorStates from "@/components/views/GV_ErrorStates.tsx";
import GV_EmailConfirmationBanner from "@/components/views/GV_EmailConfirmationBanner.tsx";

// Main unique app views
import UV_Homepage from "@/components/views/UV_Homepage.tsx";
import UV_SearchResults from "@/components/views/UV_SearchResults.tsx";
import UV_ListingDetails from "@/components/views/UV_ListingDetails.tsx";
import UV_BookingFlow from "@/components/views/UV_BookingFlow.tsx";
import UV_Auth from "@/components/views/UV_Auth.tsx";
import UV_SavedVillas from "@/components/views/UV_SavedVillas.tsx";
import UV_GuestDashboard from "@/components/views/UV_GuestDashboard.tsx";
import UV_HostDashboard from "@/components/views/UV_HostDashboard.tsx";
import UV_HostAddListing from "@/components/views/UV_HostAddListing.tsx";
import UV_HostEditListing from "@/components/views/UV_HostEditListing.tsx";
import UV_BookingDetailsDashboard from "@/components/views/UV_BookingDetailsDashboard.tsx";
import UV_Messaging from "@/components/views/UV_Messaging.tsx";
import UV_Reviews from "@/components/views/UV_Reviews.tsx";
import UV_AdminLogin from "@/components/views/UV_AdminLogin.tsx";
import UV_AdminDashboard from "@/components/views/UV_AdminDashboard.tsx";

// Zustand store
import { useAppStore } from "@/store/main";

// Helper: Returns true if current path is inside admin
const useIsAdminRoute = () => {
  const { pathname } = useLocation();
  return pathname.startsWith("/admin");
};

// Helper: Returns true if in a route that should NOT show main user nav/footer
const useIsNoNavFooterRoute = () => {
  const { pathname } = useLocation();
  return pathname.startsWith("/admin");
};

const AppContent: React.FC = () => {
  // Global state
  const user = useAppStore((s) => s.user);
  const loader_state = useAppStore((s) => s.loader_state);
  const error_state = useAppStore((s) => s.error_state);
  const reset_error_state = useAppStore((s) => s.reset_error_state);

  const isAdminRoute = useIsAdminRoute();
  const isNoNavFooter = useIsNoNavFooterRoute();

  // Role checks
  const isLoggedIn = !!user;
  const userRole = user?.role;
  const isEmailConfirmed = user?.is_email_confirmed === true;

  // Guards
  const requireAuth = (Component: React.ReactElement, fallbackTo: string = "/auth") =>
    isLoggedIn ? Component : <Navigate to={fallbackTo} replace />;
  const requireRole = (
    roles: (string | null)[],
    Component: React.ReactElement,
    fallbackTo: string = "/auth"
  ) =>
    isLoggedIn && userRole && roles.includes(userRole)
      ? Component
      : <Navigate to={fallbackTo} replace />;

  // Host-only views (dashboard/add/edit)
  const hostOnly = (Component: React.ReactElement) =>
    requireRole(["host"], Component);

  // Guest-only views (dashboard, saved)
  const guestOnly = (Component: React.ReactElement) =>
    requireRole(["guest"], Component);

  // Routes below
  return (
    <div className="flex flex-col min-h-screen bg-white relative">
      {/* TopNav and Banner only if not admin */}
      {!isNoNavFooter && (
        <>
          <GV_TopNav />
          {isLoggedIn && !isEmailConfirmed && (
            <GV_EmailConfirmationBanner />
          )}
        </>
      )}
      {/* App notification toaster - always except admin */}
      {!isAdminRoute && <GV_NotificationToaster />}
      {/* Loader overlay (appwide), goes above everything */}
      {loader_state.is_loading && (
        <div className="fixed inset-0 z-50 bg-white/50 flex items-center justify-center">
          <GV_LoaderSpinner />
        </div>
      )}
      {/* Error overlay */}
      {error_state.has_error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-100/80">
          <GV_ErrorStates
            message={error_state.message || "An error occurred"}
            onClose={reset_error_state}
          />
        </div>
      )}

      {/* Main content used for route views */}
      <div className="flex-1 flex flex-col">
        <Routes>
          {/* Public pages */}
          <Route path="/" element={<UV_Homepage />} />
          <Route path="/search" element={<UV_SearchResults />} />
          <Route path="/villa/:villa_id" element={<UV_ListingDetails />} />
          <Route path="/villa/:villa_id/book" element={<UV_BookingFlow />} />

          {/* Auth flows (standalone, no auth needed) */}
          <Route path="/auth" element={<UV_Auth />} />

          {/* Guest/Host protected */}
          <Route
            path="/saved-villas"
            element={requireRole(["guest"], <UV_SavedVillas />)}
          />
          <Route
            path="/dashboard/guest"
            element={requireRole(["guest"], <UV_GuestDashboard />)}
          />
          <Route
            path="/dashboard/host"
            element={requireRole(["host"], <UV_HostDashboard />)}
          />
          <Route
            path="/dashboard/host/add-listing"
            element={requireRole(["host"], <UV_HostAddListing />)}
          />
          <Route
            path="/dashboard/host/edit-listing/:villa_id"
            element={requireRole(["host"], <UV_HostEditListing />)}
          />
          {/* Booking details, requires user (role checked inside view) */}
          <Route
            path="/booking/:booking_id"
            element={requireAuth(<UV_BookingDetailsDashboard />)}
          />
          {/* Messaging - requires auth */}
          <Route
            path="/messages"
            element={requireAuth(<UV_Messaging />)}
          />
          {/* Reviews (leaving reviews requires auth, viewing is public) */}
          <Route
            path="/reviews"
            element={<UV_Reviews />}
          />

          {/* ADMIN ROUTES: no app nav/footer/banners */}
          <Route path="/admin/login" element={<UV_AdminLogin />} />
          <Route path="/admin" element={<UV_AdminDashboard />} />
          <Route path="/admin/:section" element={<UV_AdminDashboard />} />
          <Route path="/admin/:section/:entity_id" element={<UV_AdminDashboard />} />

          {/* TODO: Info/legal, fallback to dummy or not-found if not implemented */}
          {/* <Route path="/info/:page" element={<UV_InfoLegal />} /> */}

          {/* Catch-all: redirect home */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>

      {/* Footer only if not admin */}
      {!isNoNavFooter && <GV_Footer />}
    </div>
  );
};

const queryClient = new QueryClient();

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </BrowserRouter>
  );
};

export default App;