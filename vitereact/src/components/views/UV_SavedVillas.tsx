import React, { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Link } from "react-router-dom";
import { useAppStore } from "@/store/main";

// --- Types from shared schema ---
// (Normally import from @schema, but redefining here for usage)
type User = {
  user_id: string;
  email: string;
  name: string;
  role: string;
  profile_photo_url: string | null;
  contact_info: string | null;
  host_bio: string | null;
  is_email_confirmed: boolean;
  has_unread_messages: boolean;
  has_unread_notifications: boolean;
};

type VillaSaved = {
  user_id: string;
  villa_id: string;
  saved_at: string;
};

type Villa = {
  villa_id: string;
  host_user_id: string;
  name: string;
  subtitle: string | null;
  location: string;
  lat: number;
  lng: number;
  address: string | null;
  description: string;
  house_rules: string | null;
  special_notes: string | null;
  amenities: string;
  price_per_night: number;
  cleaning_fee: number;
  service_fee: number;
  minimum_stay_nights: number;
  cancellation_policy: string;
  status: string;
  occupancy: number;
  average_rating: number;
  review_count: number;
  created_at: string;
  updated_at: string;
};

type VillaPhoto = {
  photo_id: string;
  villa_id: string;
  url: string;
  sort_order: number;
  created_at: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// --- API fetch functions ---

// Fetch the user's saved villas (favorites)
const fetchSavedVillas = async ({
  queryKey,
}: {
  queryKey: any;
}): Promise<VillaSaved[]> => {
  const [_key, { user_id }] = queryKey;
  // Use auth token, so pass headers (axios uses interceptor or get from store)
  const token = useAppStore.getState().auth_token;
  const { data } = await axios.get(
    `${API_BASE}/villa-saved?user_id=${encodeURIComponent(user_id)}&limit=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  // Type check and filter
  return Array.isArray(data) ? data : [];
};

// Fetch ALL villa details for an array of ids
const fetchVillaDetail = async (
  villa_id: string,
  token: string | null
): Promise<Villa> => {
  const { data } = await axios.get(`${API_BASE}/villas/${villa_id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return data;
};

// Fetch the 1st/listing photo for a villa
const fetchVillaCardPhoto = async (
  villa_id: string,
  token: string | null
): Promise<string | null> => {
  try {
    const { data } = await axios.get(
      `${API_BASE}/villas/${villa_id}/photos?limit=1&sort_by=sort_order&sort_order=asc`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (Array.isArray(data) && data.length > 0) {
      return data[0].url;
    }
    return null;
  } catch {
    return null;
  }
};

// Remove a villa from the user's saved list (favorites)
const unsaveVilla = async ({
  user_id,
  villa_id,
  token,
}: {
  user_id: string;
  villa_id: string;
  token: string | null;
}) => {
  await axios.delete(`${API_BASE}/villa-saved`, {
    data: { user_id, villa_id },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return { villa_id };
};

// --- Main Component ---

const UV_SavedVillas: React.FC = () => {
  // State selectors (using correct Zustand pattern)
  const user = useAppStore((s) => s.user);
  const auth_token = useAppStore((s) => s.auth_token);
  const saved_villa_ids = useAppStore((s) => s.saved_villa_ids);
  const remove_saved_villa_id = useAppStore((s) => s.remove_saved_villa_id);
  const set_error_state = useAppStore((s) => s.set_error_state);

  const queryClient = useQueryClient();

  // --- Fetch the villa-saved list ---
  const {
    data: savedVillasData,
    isLoading: isLoadingSaved,
    isError: isErrorSaved,
    error: errorSaved,
    refetch: refetchSaved,
  } = useQuery<VillaSaved[], Error>({
    queryKey: ["villa-saved", { user_id: user?.user_id }],
    queryFn: fetchSavedVillas,
    enabled: !!user?.user_id,
    staleTime: 60 * 1000, // refresh every minute
  });

  // Memoize the list of villa_ids (from global state), or fall back to the list from results
  const villaSavedIds: string[] = useMemo(() => {
    if (Array.isArray(saved_villa_ids) && saved_villa_ids.length > 0) {
      return saved_villa_ids;
    }
    // fallback to query results if zustand not in sync
    if (savedVillasData && savedVillasData.length > 0) {
      return savedVillasData.map((v) => v.villa_id);
    }
    return [];
  }, [saved_villa_ids, savedVillasData]);

  // --- Fetch villa detail + main photo for each villa_id ---
  // We fetch ALL details in parallel using useQueries (but must inline to avoid splitting render functions).
  const villaDetailQueries = useMemo(
    () =>
      villaSavedIds.map((villa_id) => ({
        queryKey: ["villa", villa_id],
        queryFn: () => fetchVillaDetail(villa_id, auth_token),
        enabled: !!auth_token && !!villa_id,
        staleTime: 10 * 60 * 1000,
      })),
    [villaSavedIds, auth_token]
  );

  // Pull all villa details; this returns an array of { data, isLoading ... }
  // @ts-expect-error v5 type helper missing, but it's fine:
  // eslint-disable-next-line
  const villaDetailResults = useQuery(villaDetailQueries);

  // Helper map from villa_id to villa data
  const villasMap: Record<string, Villa | undefined> = {};
  villaSavedIds.forEach((id, idx) => {
    const detail = Array.isArray(villaDetailResults)
      ? villaDetailResults[idx]?.data
      : undefined;
    if (detail && typeof detail.villa_id === "string") {
      villasMap[id] = detail;
    }
  });

  // --- Fetch villa card photos for each villa ---
  const villaPhotoQueries = useMemo(
    () =>
      villaSavedIds.map((villa_id) => ({
        queryKey: ["villa-photo", villa_id],
        queryFn: () => fetchVillaCardPhoto(villa_id, auth_token),
        enabled: !!auth_token && !!villa_id,
        staleTime: 10 * 60 * 1000,
      })),
    [villaSavedIds, auth_token]
  );
  // @ts-expect-error same as above
  // eslint-disable-next-line
  const villaPhotoResults = useQuery(villaPhotoQueries);

  // Helper map from villa_id to photo url (or fallback)
  const villaPhotosMap: Record<string, string | null> = {};
  villaSavedIds.forEach((id, idx) => {
    const url =
      Array.isArray(villaPhotoResults) && villaPhotoResults[idx]
        ? villaPhotoResults[idx].data
        : null;
    villaPhotosMap[id] = url || `https://picsum.photos/seed/${id}/450/320`;
  });

  // --- Remove villa mutation ---
  const {
    mutate: unsaveVillaMutate,
    isLoading: isUnsaveLoading,
    variables: unsaveVars,
  } = useMutation({
    mutationFn: (payload: { villa_id: string }) =>
      unsaveVilla({
        user_id: user?.user_id as string,
        villa_id: payload.villa_id,
        token: auth_token,
      }),
    onMutate: async ({ villa_id }) => {
      // Optimistically remove from Zustand favs for better UX.
      remove_saved_villa_id(villa_id);
      queryClient.setQueryData(
        ["villa-saved", { user_id: user?.user_id }],
        (prev: VillaSaved[] | undefined) =>
          prev ? prev.filter((v) => v.villa_id !== villa_id) : []
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries(["villa-saved", { user_id: user?.user_id }]);
    },
    onError: (error: any, vars: { villa_id: string }) => {
      set_error_state({
        has_error: true,
        message:
          (error?.response?.data?.error as string) ||
          "Could not remove from favorites.",
        context: "remove_saved_villa",
      });
      // Optionally re-add to Zustand saved list if rollback wanted
    },
  });

  // --- Loading/Error states ---
  const isAnyLoading =
    isLoadingSaved ||
    (Array.isArray(villaDetailResults) &&
      villaDetailResults.some((q) => q.isLoading));
  const isAnyError =
    isErrorSaved ||
    (Array.isArray(villaDetailResults) &&
      villaDetailResults.some((q) => q.isError));

  // --- Render ---
  return (
    <>
      <main className="max-w-5xl mx-auto px-4 py-8 flex flex-col items-center min-h-[60vh] w-full">
        <h1 className="text-3xl font-bold mb-6 text-neutral-800">Saved Villas</h1>

        {isAnyLoading && (
          <div className="w-full flex flex-col items-center py-7">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mb-3" />
            <span className="text-lg text-neutral-600">Loading your saved villas…</span>
          </div>
        )}

        {isAnyError && (
          <div
            className="w-full flex flex-col gap-3 justify-center items-center bg-red-50 border border-red-200 rounded-lg py-8 mt-4"
            role="alert"
            aria-live="polite"
          >
            <span className="font-medium text-red-500 mb-2">
              Failed to load saved/favorited villas.
            </span>
            <button
              className="px-3 py-1.5 rounded bg-cyan-50 border border-cyan-200 text-cyan-700 hover:bg-cyan-100 font-semibold"
              onClick={() => refetchSaved()}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isAnyLoading &&
          !isAnyError &&
          villaSavedIds.length === 0 && (
            <div className="w-full flex flex-col items-center justify-center mt-8 gap-3 select-none">
              {/* Illustration */}
              <svg width={110} height={110} className="mb-3" viewBox="0 0 110 110" aria-hidden="true">
                <circle cx="55" cy="55" r="50" fill="#e0f2fe" />
                <path
                  d="M55 26 C62 36, 86 36, 86 54 C86 80, 24 80, 24 54 C24 36, 48 36, 55 26 Z"
                  fill="#38bdf8"
                  opacity="0.4"
                />
                <path
                  d="M45 54 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0"
                  fill="#38bdf8"
                  opacity="0.8"
                />
              </svg>
              <div className="text-lg font-medium text-neutral-700 mb-1">
                No villas saved yet!
              </div>
              <div className="text-neutral-500 mb-2 text-sm">
                Add villas to your favorites and revisit them anytime.
              </div>
              <Link
                to="/search"
                className="inline-block text-base font-semibold text-cyan-700 px-4 py-2 bg-cyan-50 rounded hover:bg-cyan-100 ring-cyan-300 outline-none transition"
              >
                Start discovering
              </Link>
            </div>
          )}

        {/* Villa Cards */}
        {!isAnyLoading &&
          !isAnyError &&
          villaSavedIds.length > 0 && (
            <section
              className="grid gap-7 sm:grid-cols-2 md:grid-cols-3 grid-cols-1 w-full"
              aria-live="polite"
            >
              {villaSavedIds.map((villa_id, idx) => {
                const villa = villasMap[villa_id];
                const photo_url = villaPhotosMap[villa_id];
                const isUnsaveThis =
                  isUnsaveLoading && unsaveVars?.villa_id === villa_id;
                // Defensive: skip if villa detail missing
                if (!villa) return null;
                return (
                  <div
                    key={villa_id}
                    className="relative bg-white shadow-md rounded-xl overflow-hidden flex flex-col h-full hover:shadow-lg transition-shadow group"
                  >
                    <Link to={`/villa/${villa_id}`} tabIndex={0}>
                      <img
                        src={
                          photo_url ||
                          `https://picsum.photos/seed/${villa_id}/450/320`
                        }
                        alt={
                          // Defensive: escape potential user input
                          villa.name.replace(/[^a-zA-Z0-9 '.,-]/g, "") +
                          " photo"
                        }
                        className="w-full h-48 object-cover group-hover:opacity-90 transition"
                        style={{ background: "#f5f5f5" }}
                        loading="lazy"
                      />
                    </Link>
                    <div className="flex flex-col flex-1 p-4">
                      <div className="flex items-start justify-between mb-1">
                        <Link
                          to={`/villa/${villa_id}`}
                          className="font-semibold text-lg leading-6 text-neutral-800 hover:text-cyan-700 transition-colors truncate max-w-[200px]"
                        >
                          {villa.name}
                        </Link>
                        {/* Unsave/Favorite Button */}
                        <button
                          className={`ml-2 focus:outline-none focus-visible:ring ring-cyan-300 p-1.5 rounded-full transition duration-150 group-hover:bg-cyan-50 ${isUnsaveThis ? "opacity-60 pointer-events-none" : ""}`}
                          aria-label="Remove from saved (unfavorite)"
                          tabIndex={0}
                          onClick={() => {
                            if (window.confirm("Remove this villa from your favorites?")) {
                              unsaveVillaMutate({ villa_id });
                            }
                          }}
                          disabled={isUnsaveThis}
                        >
                          {/* Heart with fill if favorited */}
                          <svg
                            viewBox="0 0 24 24"
                            fill="#38bdf8"
                            stroke="#0e7490"
                            strokeWidth={1}
                            className="w-6 h-6"
                            aria-hidden="true"
                          >
                            <path
                              d="M12 21C12 21 4.5 13.678 4.5 8.885A4.385 4.385 0 0 1 12 6.333a4.385 4.385 0 0 1 7.5 2.552C19.5 13.678 12 21 12 21z"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="text-neutral-500 text-sm mb-2 truncate">
                        {villa.location}
                      </div>
                      <div className="flex items-center mb-1">
                        <span className="text-cyan-700 font-bold text-base mr-2">
                          ${villa.price_per_night}
                        </span>
                        <span className="text-neutral-400 text-xs font-normal">/night</span>
                        {/* Rating */}
                        <span className="ml-auto flex items-center gap-0.5 text-sm text-yellow-500">
                          <svg
                            className="h-4 w-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.948a1 1 0 0 0 .95.69h4.148c.969 0 1.371 1.24.588 1.81l-3.36 2.448a1 1 0 0 0-.364 1.118l1.285 3.948c.3.921-.755 1.688-1.54 1.118l-3.36-2.448a1 1 0 0 0-1.175 0l-3.36 2.448c-.784.57-1.838-.197-1.539-1.118l1.285-3.948a1 1 0 0 0-.364-1.118L2.075 9.375c-.783-.57-.38-1.81.588-1.81h4.149a1 1 0 0 0 .95-.69l1.287-3.948z" />
                          </svg>
                          <span className="ml-0.5">{villa.average_rating.toFixed(1)}</span>
                          <span className="ml-1 text-neutral-400 font-normal">({villa.review_count})</span>
                        </span>
                      </div>
                      {/* Optional subtitle (truncate) */}
                      {villa.subtitle && (
                        <div className="text-neutral-400 text-xs mb-1 truncate">
                          {villa.subtitle}
                        </div>
                      )}
                      {/* Amenities/short */}
                      <div className="flex flex-wrap gap-1 mt-auto">
                        {/* For MVP: just #bedrooms and #guests */}
                        <span className="bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded text-xs">
                          Sleeps {villa.occupancy}
                        </span>
                        {/* If needed: add more */}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
      </main>
    </>
  );
};

export default UV_SavedVillas;