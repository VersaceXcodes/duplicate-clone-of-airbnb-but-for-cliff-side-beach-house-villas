import React from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosRequestConfig } from "axios";
import { useAppStore } from "@/store/main";

// Types pulled from zod schemas (ex: via @schema), redeclared here for type safety:
interface Villa {
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
  amenities: string; // comma separated slugs
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
}
interface Amenity {
  slug: string;
  label: string;
  icon_url: string | null;
}
interface VillaSaved {
  user_id: string;
  villa_id: string;
  saved_at: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const VILLA_PAGE_SIZE = 20;
const AMENITIES_LIMIT = 50;
const SAVED_VILLAS_LIMIT = 100;

const DEFAULT_FILTERS = {
  location: null,
  start_date: null,
  end_date: null,
  adults: 1,
  children: 0,
  infants: 0,
  price_min: null,
  price_max: null,
  amenities: [] as string[],
  sort_by: "popularity",
  page: 1,
  view_mode: "list",
  ne_lat: null,
  ne_lng: null,
  sw_lat: null,
  sw_lng: null,
};

function sanitizeQueryString(str: string | null): string {
  if (!str) return "";
  return str.replace(/[^a-zA-Z0-9 ,\-_.]/g, "").slice(0, 255);
}

function parseNumber(val: string | null): number | null {
  if (!val) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parseAmenities(val: string | null): string[] {
  if (!val) return [];
  return val.split(",").map(s => s.trim()).filter(Boolean);
}

const UV_SearchResults: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Store: individual selectors (DO NOT destructure object from Zustand!)
  const user = useAppStore(s => s.user);
  const auth_token = useAppStore(s => s.auth_token);
  const saved_villa_ids = useAppStore(s => s.saved_villa_ids);
  const set_saved_villa_ids = useAppStore(s => s.set_saved_villa_ids);
  const add_saved_villa_id = useAppStore(s => s.add_saved_villa_id);
  const remove_saved_villa_id = useAppStore(s => s.remove_saved_villa_id);

  // -------- Filter state: map URL params to filters -------
  const initialFilters = React.useMemo(() => {
    // Each param type must be carefully parsed/sanitized
    return {
      location: sanitizeQueryString(searchParams.get("location")),
      start_date: sanitizeQueryString(searchParams.get("start_date")),
      end_date: sanitizeQueryString(searchParams.get("end_date")),
      adults: parseNumber(searchParams.get("adults")) || 1,
      children: parseNumber(searchParams.get("children")) || 0,
      infants: parseNumber(searchParams.get("infants")) || 0,
      price_min: parseNumber(searchParams.get("price_min")),
      price_max: parseNumber(searchParams.get("price_max")),
      amenities: parseAmenities(searchParams.get("amenities")),
      sort_by: sanitizeQueryString(searchParams.get("sort_by")) || "popularity",
      page: parseNumber(searchParams.get("page")) || 1,
      view_mode: searchParams.get("view_mode") === "map" ? "map" : "list",
      ne_lat: parseNumber(searchParams.get("ne_lat")),
      ne_lng: parseNumber(searchParams.get("ne_lng")),
      sw_lat: parseNumber(searchParams.get("sw_lat")),
      sw_lng: parseNumber(searchParams.get("sw_lng")),
    };
    // eslint-disable-next-line
  }, [Array.from(searchParams.entries()).join(":")]);

  const [filters, setFilters] = React.useState<typeof DEFAULT_FILTERS>(initialFilters);

  // Sync filters <-> url params on change
  React.useEffect(() => {
    const params: Record<string, string> = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
        if (Array.isArray(v)) {
          // amenities
          params[k] = v.join(",");
        } else {
          params[k] = String(v);
        }
      }
    });
    setSearchParams(params, { replace: true });
  }, [
    filters.location,
    filters.start_date,
    filters.end_date,
    filters.adults,
    filters.children,
    filters.infants,
    filters.price_min,
    filters.price_max,
    filters.amenities,
    filters.sort_by,
    filters.page,
    filters.view_mode,
    filters.ne_lat,
    filters.ne_lng,
    filters.sw_lat,
    filters.sw_lng,
    setSearchParams,
  ]);

  // -------------- Amenities: GET /amenities --------------
  const {
    data: amenities_options,
    isLoading: amenitiesLoading,
    isError: amenitiesError,
  } = useQuery<Amenity[], Error>({
    queryKey: ["amenities"],
    queryFn: async () => {
      const url = `${API_BASE}/amenities?limit=${AMENITIES_LIMIT}`;
      const res = await axios.get<Amenity[]>(url);
      return res.data;
    },
    staleTime: 1000 * 60 * 10,
  });

  // ----- Fetch Villas: GET /villas (all filters) ---------
  const {
    data: villas,
    isLoading: villasLoading,
    isError: villasError,
    refetch: refetchVillas,
  } = useQuery<Villa[], Error>({
    queryKey: [
      "villas/search",
      filters.location,
      filters.start_date,
      filters.end_date,
      filters.adults,
      filters.children,
      filters.infants,
      filters.price_min,
      filters.price_max,
      filters.amenities,
      filters.sort_by,
      filters.page,
      filters.view_mode,
      filters.ne_lat,
      filters.ne_lng,
      filters.sw_lat,
      filters.sw_lng,
    ],
    queryFn: async () => {
      const params: any = {
        limit: VILLA_PAGE_SIZE,
        page: filters.page,
        sort_by: filters.sort_by === "popularity" ? "review_count" : filters.sort_by, // "popularity" = review_count
        location: filters.location || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
        adults: filters.adults || undefined,
        children: filters.children || undefined,
        infants: filters.infants || undefined,
        price_min: filters.price_min || undefined,
        price_max: filters.price_max || undefined,
        amenities: filters.amenities.length ? filters.amenities.join(",") : undefined,
        view_mode: filters.view_mode,
        ne_lat: filters.ne_lat || undefined,
        ne_lng: filters.ne_lng || undefined,
        sw_lat: filters.sw_lat || undefined,
        sw_lng: filters.sw_lng || undefined,
      };
      // Remove undefined keys to avoid api errors
      Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);
      const url = `${API_BASE}/villas`;
      const rq: AxiosRequestConfig = { params };
      const res = await axios.get<Villa[]>(url, rq);
      return res.data;
    },
    keepPreviousData: true,
  });

  // ----- Fetch Saved Villas for user/guest ---------------
  React.useEffect(() => {
    // Only fetch on mount if logged in as guest and not yet loaded
    if (
      user &&
      user.role === "guest" &&
      !!auth_token &&
      saved_villa_ids.length === 0
    ) {
      axios
        .get<VillaSaved[]>(
          `${API_BASE}/villa-saved`,
          {
            params: { user_id: user.user_id, limit: SAVED_VILLAS_LIMIT },
            headers: { Authorization: `Bearer ${auth_token}` },
          }
        )
        .then(res => {
          const ids = res.data.map((vs) => vs.villa_id);
          set_saved_villa_ids(ids);
        })
        .catch((_e) => { });
    }
    // eslint-disable-next-line
  }, [user?.user_id, auth_token]);

  // Local optimistic updating for saved_villa_ids after mutation
  const queryClient = useQueryClient();

  // ------------- FAVORITE/UNSAVED MUTATIONS ---------------

  const favMutation = useMutation<
    string,
    Error,
    { villa_id: string; action: "add" | "remove" }
  >({
    mutationFn: async ({ villa_id, action }) => {
      if (!user || !user.user_id || !auth_token) throw new Error("Not authenticated");
      // Add favorite
      if (action === "add") {
        const res = await axios.post<VillaSaved>(
          `${API_BASE}/villa-saved`,
          {
            user_id: user.user_id,
            villa_id,
          },
          { headers: { Authorization: `Bearer ${auth_token}` } }
        );
        return res.data.villa_id;
      } else {
        // Remove favorite
        await axios.delete(`${API_BASE}/villa-saved`, {
          data: { user_id: user.user_id, villa_id },
          headers: { Authorization: `Bearer ${auth_token}` },
        });
        return villa_id;
      }
    },
    onSuccess: (villa_id, vars) => {
      if (vars.action === "add") {
        add_saved_villa_id(villa_id);
      } else {
        remove_saved_villa_id(villa_id);
      }
      queryClient.invalidateQueries({ queryKey: ["villa-saved", user?.user_id] });
    },
    onError: () => { /* Feedback handled in aria-live alert */ },
  });

  // ---------- Handle Favorite toggle -----------
  const handleToggleFav = (villa_id: string, isSaved: boolean) => {
    if (!user || user.role !== "guest") {
      // Not logged in or not guest. Suggest login.
      setShowFavLogin(true);
      return;
    }
    if (favMutation.isPending) return;
    favMutation.mutate({ villa_id, action: isSaved ? "remove" : "add" });
  };

  // ----------- Handle View Mode Toggle --------
  const handleViewModeSwitch = (mode: "list" | "map") => {
    setFilters((prev) => ({ ...prev, view_mode: mode }));
  };

  // ------------ Filter Modal/Switches ---------
  const [filterDrawerOpen, setFilterDrawerOpen] = React.useState(false);

  // ------------- Heart login modal for favorite/unsaved -------------
  const [showFavLogin, setShowFavLogin] = React.useState(false);

  // ------------- Controlled filter fields -------------
  // For form fields controlling the search/filter bar
  const [form, setForm] = React.useState({
    location: filters.location || "",
    start_date: filters.start_date || "",
    end_date: filters.end_date || "",
    adults: filters.adults || 1,
    children: filters.children || 0,
    infants: filters.infants || 0,
    price_min: filters.price_min ?? "",
    price_max: filters.price_max ?? "",
    amenities: filters.amenities || [],
    sort_by: filters.sort_by,
  });

  // When the filters update, sync the controlled fields
  React.useEffect(() => {
    setForm({
      location: filters.location || "",
      start_date: filters.start_date || "",
      end_date: filters.end_date || "",
      adults: filters.adults,
      children: filters.children,
      infants: filters.infants,
      price_min: filters.price_min ?? "",
      price_max: filters.price_max ?? "",
      amenities: filters.amenities,
      sort_by: filters.sort_by,
    });
    // eslint-disable-next-line
  }, [filters]);

  // Change handlers for filters
  function handleFormInput<K extends keyof typeof form>(k: K, v: any) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }
  // Apply filters
  function applyFilters(evt?: React.FormEvent) {
    if (evt) evt.preventDefault();
    setFilters(prev => ({
      ...prev,
      location: sanitizeQueryString(form.location),
      start_date: sanitizeQueryString(form.start_date),
      end_date: sanitizeQueryString(form.end_date),
      adults: Number(form.adults) || 1,
      children: Number(form.children) || 0,
      infants: Number(form.infants) || 0,
      price_min: parseNumber(String(form.price_min)),
      price_max: parseNumber(String(form.price_max)),
      amenities: Array.isArray(form.amenities) ? form.amenities : [],
      sort_by: (form.sort_by as string) || "popularity",
      page: 1, // Reset to first page on filter
    }));
    setFilterDrawerOpen(false);
  }

  // Pagination controls
  function setPage(newPage: number) {
    if (newPage <= 0) return;
    setFilters(prev => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // --- List/map view render helpers ---
  function getVillaMainImg(villa_id: string): string {
    // For now, use a stable picsum.photos based on villa_id for fake data
    return `https://picsum.photos/seed/${encodeURIComponent(villa_id)}/480/320`;
  }

  // --- Amenities SLUG->LABEL/ICON ---
  function amenityDisplay(slug: string): { label: string; icon_url: string | null } {
    const found = amenities_options?.find(a => a.slug === slug);
    return found
      ? { label: found.label, icon_url: found.icon_url }
      : { label: slug.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()), icon_url: null };
  }

  // Focus filter modal (mobile accessibility)
  const filterDrawerBtnRef = React.useRef<HTMLButtonElement>(null);

  // --- Loading/error & empty states ---
  const showLoading = villasLoading || amenitiesLoading;
  const showError = villasError || amenitiesError;

  // --- List of results (array) ---
  const results: Villa[] = Array.isArray(villas) ? villas : [];

  return (
    <>
      {/* Filter/Sort/Search Bar */}
      <section className="bg-white border-b border-slate-100 sticky top-0 z-20">
        <form
          className="flex flex-col md:flex-row gap-2 px-4 py-3 md:items-center"
          onSubmit={applyFilters}
          aria-label="Search and filter villas"
        >
          {/* Location */}
          <label className="sr-only" htmlFor="location">Location</label>
          <input
            id="location"
            className="w-full md:w-52 border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none"
            type="text"
            placeholder="Location"
            value={form.location}
            onChange={e => handleFormInput("location", e.target.value)}
            autoComplete="off"
          />
          {/* Dates */}
          <input
            type="date"
            className="w-full md:w-36 border border-slate-300 rounded px-2 py-1 text-sm"
            value={form.start_date}
            onChange={e => handleFormInput("start_date", e.target.value)}
            aria-label="Start date"
          />
          <span className="hidden md:inline-block text-slate-400 mx-1">→</span>
          <input
            type="date"
            className="w-full md:w-36 border border-slate-300 rounded px-2 py-1 text-sm"
            value={form.end_date}
            onChange={e => handleFormInput("end_date", e.target.value)}
            aria-label="End date"
          />
          {/* Guests */}
          <input
            type="number"
            className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
            min={1}
            value={form.adults}
            onChange={e => handleFormInput("adults", Math.max(1, Number(e.target.value)))}
            aria-label="Adults"
            placeholder="Adults"
          />
          <input
            type="number"
            className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
            min={0}
            value={form.children}
            onChange={e => handleFormInput("children", Math.max(0, Number(e.target.value)))}
            aria-label="Children"
            placeholder="Children"
          />
          <input
            type="number"
            className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
            min={0}
            value={form.infants}
            onChange={e => handleFormInput("infants", Math.max(0, Number(e.target.value)))}
            aria-label="Infants"
            placeholder="Infants"
          />
          {/* Price Range */}
          <input
            type="number"
            className="w-24 border border-slate-300 rounded px-2 py-1 text-sm"
            min={0}
            placeholder="Min Price"
            value={form.price_min}
            onChange={e => handleFormInput("price_min", e.target.value)}
            aria-label="Min price per night"
          />
          <input
            type="number"
            className="w-24 border border-slate-300 rounded px-2 py-1 text-sm"
            min={0}
            placeholder="Max Price"
            value={form.price_max}
            onChange={e => handleFormInput("price_max", e.target.value)}
            aria-label="Max price per night"
          />
          {/* Amenities - visible md+ or collapse */}
          <button
            type="button"
            className="rounded border font-semibold text-sm px-3 py-1 ml-auto border-slate-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
            aria-label="Open amenity & filter options"
            onClick={() => setFilterDrawerOpen(true)}
            ref={filterDrawerBtnRef}
          >
            <span className="hidden md:inline">More filters</span>
            <span className="md:hidden">Filters</span>
          </button>
          {/* Sort */}
          <label className="sr-only" htmlFor="sort_by">Sort</label>
          <select
            id="sort_by"
            className="w-36 border border-slate-300 rounded px-2 py-1 text-sm"
            value={form.sort_by}
            onChange={e => handleFormInput("sort_by", e.target.value)}
            aria-label="Sort results by"
          >
            <option value="popularity">Most Popular</option>
            <option value="price_per_night">Price (Low→High)</option>
            <option value="average_rating">Highest Rated</option>
            <option value="created_at">Newest</option>
          </select>
          {/* Submit */}
          <button
            type="submit"
            className="rounded bg-blue-600 text-white font-semibold px-4 py-1 ml-2 hover:bg-blue-700 focus:outline-none"
            aria-label="Apply search filters"
          >Search</button>
        </form>
        {/* View mode toggle */}
        <div className="flex items-center justify-end px-4 space-x-2 pb-2">
          <button
            type="button"
            className={`border rounded-l px-3 py-1 text-sm font-medium ${filters.view_mode === "list" ? "bg-blue-600 text-white" : "bg-white text-blue-700 border-slate-300"}`}
            aria-label="List view"
            aria-pressed={filters.view_mode === "list"}
            tabIndex={0}
            onClick={() => handleViewModeSwitch("list")}
          >List</button>
          <button
            type="button"
            className={`border rounded-r px-3 py-1 text-sm font-medium ${filters.view_mode === "map" ? "bg-blue-600 text-white" : "bg-white text-blue-700 border-slate-300"}`}
            aria-label="Map view"
            aria-pressed={filters.view_mode === "map"}
            tabIndex={0}
            onClick={() => handleViewModeSwitch("map")}
          >Map</button>
        </div>
      </section>

      {/* Amenity/advanced filters modal */}
      {filterDrawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/25 flex items-start md:items-center justify-center transition">
          <div className="bg-white rounded shadow-lg w-full max-w-lg p-5 mt-10 relative">
            <button
              onClick={() => setFilterDrawerOpen(false)}
              aria-label="Close filters"
              className="absolute top-2 right-2 p-2 text-lg font-bold text-slate-400 focus:outline-none"
            >&times;</button>
            <form onSubmit={applyFilters} className="space-y-4">
              {/* Amenities options */}
              <div>
                <div className="font-medium mb-2">Amenities</div>
                {amenitiesLoading ? (
                  <div className="text-slate-400">Loading...</div>
                ) : amenities_options && amenities_options.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {amenities_options.map(a => (
                      <label
                        key={a.slug}
                        className={`px-2 py-1 border rounded ${form.amenities.includes(a.slug) ? "bg-blue-600 text-white border-blue-700" : "bg-slate-50 text-slate-700 border-slate-200"} cursor-pointer flex items-center select-none`}
                        tabIndex={0}
                        aria-checked={form.amenities.includes(a.slug)}
                        role="checkbox"
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={form.amenities.includes(a.slug)}
                          onChange={e => {
                            if (e.target.checked) {
                              handleFormInput("amenities", [...form.amenities, a.slug]);
                            } else {
                              handleFormInput("amenities", form.amenities.filter((x: string) => x !== a.slug));
                            }
                          }}
                        />
                        {a.icon_url && (
                          <img src={a.icon_url} alt="" className="w-5 h-5 mr-1" />
                        )}
                        {a.label}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-400">No amenities available</div>
                )}
              </div>
              {/* Min/max price */}
              <div className="flex space-x-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Min Price"
                  className="w-24 border border-slate-300 rounded px-2 py-1 text-sm"
                  value={form.price_min}
                  onChange={e => handleFormInput("price_min", e.target.value)}
                  aria-label="Min price per night"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Max Price"
                  className="w-24 border border-slate-300 rounded px-2 py-1 text-sm"
                  value={form.price_max}
                  onChange={e => handleFormInput("price_max", e.target.value)}
                  aria-label="Max price per night"
                />
              </div>
              {/* Guest counts */}
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
                  value={form.adults}
                  onChange={e => handleFormInput("adults", Number(e.target.value) || 1)}
                  aria-label="Adults"
                  placeholder="Adults"
                />
                <input
                  type="number"
                  min={0}
                  className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
                  value={form.children}
                  onChange={e => handleFormInput("children", Number(e.target.value) || 0)}
                  aria-label="Children"
                  placeholder="Children"
                />
                <input
                  type="number"
                  min={0}
                  className="w-20 border border-slate-300 rounded px-2 py-1 text-sm"
                  value={form.infants}
                  onChange={e => handleFormInput("infants", Number(e.target.value) || 0)}
                  aria-label="Infants"
                  placeholder="Infants"
                />
              </div>
              {/* Sort / reset */}
              <div className="flex justify-between items-center pt-3">
                <button
                  type="button"
                  className="text-blue-700 text-sm underline"
                  onClick={() => {
                    setForm({ ...DEFAULT_FILTERS });
                  }}
                >Reset to defaults</button>
                <button
                  type="submit"
                  className="bg-blue-600 text-white rounded px-4 py-1 font-semibold"
                >Apply Filters</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Login/Prompt for favorite heart */}
      {showFavLogin && (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="bg-white rounded shadow-lg max-w-sm p-6 flex flex-col items-center">
            <p className="mb-3 font-semibold text-center text-slate-800">Please log in as a guest to save/favorite villas.</p>
            <Link to="/auth" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold mt-2">Log In / Sign Up</Link>
            <button
              className="mt-3 text-sm text-slate-500 underline"
              onClick={() => setShowFavLogin(false)}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Feedback on favorite (aria-live polite for toast/alerts) */}
      {(favMutation.isPending || favMutation.isError) && (
        <div
          className="fixed bottom-2 left-1/2 transform -translate-x-1/2 z-40 bg-white rounded px-4 py-2 border border-slate-300 shadow"
          role="alert"
          aria-live="polite"
        >
          {favMutation.isPending && "Saving..."}
          {favMutation.isError && "Could not update favorite list. Please try again."}
        </div>
      )}

      {/* Main content section */}
      <main className="max-w-7xl mx-auto w-full flex flex-col md:flex-row mt-2 px-2 md:px-6 pb-8 gap-x-4">
        {/* List view */}
        {filters.view_mode === "list" && (
          <div className="flex-1">
            {showLoading && (
              <div className="w-full py-16 flex justify-center items-center">
                <span className="animate-spin text-3xl" role="status" aria-live="polite" aria-busy="true">⏳</span>
                <span className="ml-2 text-slate-400">Loading search results...</span>
              </div>
            )}
            {showError && (
              <div className="w-full py-16 flex flex-col items-center" aria-live="polite" role="alert">
                <span className="text-2xl text-red-500 mb-2">⚠️</span>
                <span className="text-red-600 font-semibold">Unable to load villas. Please refresh or try again.</span>
              </div>
            )}
            {!showLoading && !showError && results.length === 0 && (
              <div className="w-full py-24 flex flex-col items-center" aria-live="polite">
                <span className="text-slate-400 text-6xl mb-1">🧐</span>
                <div className="text-lg font-semibold mb-2">No cliff-side villas match your search.</div>
                <div className="text-slate-500 text-sm mb-2">
                  Try a different location or relax some filters for a wider search.
                </div>
                <button
                  className="rounded bg-blue-600 text-white px-4 py-1 font-semibold mt-2"
                  onClick={() => setFilterDrawerOpen(true)}
                >Open Filters</button>
              </div>
            )}
            <section
              className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-4"
              aria-label="Villa search results"
            >
              {results.length > 0 &&
                results.map((villa) => {
                  const amenityList = villa.amenities ? villa.amenities.split(",") : [];
                  const isSaved = !!saved_villa_ids?.includes(villa.villa_id);
                  return (
                    <article
                      key={villa.villa_id}
                      tabIndex={0}
                      className="relative bg-white border hover:shadow-lg rounded-lg overflow-hidden transition flex flex-col"
                    >
                      <Link
                        to={`/villa/${villa.villa_id}`}
                        className="block group focus:outline-none focus:ring-2 focus:ring-blue-300"
                        aria-label={`View details for ${villa.name}`}
                      >
                        <img
                          className="w-full h-48 object-cover bg-slate-100"
                          src={getVillaMainImg(villa.villa_id)}
                          alt="Cliff villa view"
                          loading="lazy"
                        />
                        <div className="absolute top-2 right-2 z-10">
                          {/* Favorite heart */}
                          <button
                            className={`rounded-full border-2 border-white shadow-sm w-9 h-9 flex items-center justify-center bg-white hover:bg-blue-50 transition focus:ring-2 focus:ring-blue-300 outline-none`}
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleFav(villa.villa_id, isSaved);
                            }}
                            aria-label={
                              user && user.role === "guest"
                                ? isSaved
                                  ? "Unsave villa from favorites"
                                  : "Save villa to favorites"
                                : "Log in as guest to save villas"
                            }
                            tabIndex={0}
                            aria-pressed={isSaved}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill={isSaved ? "#2563eb" : "none"}
                              stroke={isSaved ? "#2563eb" : "#64748b"}
                              strokeWidth={2}
                              className="w-6 h-6"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 20.5l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 10.68L12 20.5z"
                              />
                            </svg>
                          </button>
                        </div>
                        <div className="p-3">
                          <div className="flex items-baseline justify-between">
                            <h2 className="font-bold text-lg text-blue-900 truncate">{villa.name}</h2>
                            <span className="text-blue-600 font-bold text-lg">${villa.price_per_night}</span>
                          </div>
                          <div className="text-slate-500 text-xs font-medium truncate">{villa.location}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-yellow-500 font-bold">{villa.average_rating?.toFixed(1) || "–"}</span>
                            <span className="text-slate-400 text-xs">({villa.review_count})</span>
                          </div>
                          {amenityList.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {amenityList.slice(0, 3).map(slug => {
                                const a = amenityDisplay(slug);
                                return (
                                  <span key={slug} className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-xs text-blue-800 font-medium mr-1">
                                    {a.icon_url && (
                                      <img src={a.icon_url} alt={a.label} className="w-3 h-3 mr-1" />
                                    )}
                                    {a.label}
                                  </span>
                                );
                              })}
                              {amenityList.length > 3 && (
                                <span className="ml-2 text-slate-400 text-xs">+{amenityList.length - 3} more</span>
                              )}
                            </div>
                          )}
                        </div>
                      </Link>
                    </article>
                  );
                })}
            </section>
            {/* Pagination */}
            {results.length > 0 && (
              <nav className="flex items-center justify-center gap-4 mt-8 select-none" aria-label="Pagination">
                <button
                  className="rounded px-3 py-1 font-semibold text-blue-700 bg-blue-50 border border-blue-100 hover:bg-blue-200 disabled:opacity-40"
                  disabled={filters.page <= 1}
                  onClick={() => setPage(filters.page - 1)}
                  aria-label="Previous page"
                >Prev</button>
                <span className="text-slate-700 font-semibold text-sm px-2">Page {filters.page}</span>
                <button
                  className="rounded px-3 py-1 font-semibold text-blue-700 bg-blue-50 border border-blue-100 hover:bg-blue-200 disabled:opacity-40"
                  disabled={results.length < VILLA_PAGE_SIZE}
                  onClick={() => setPage(filters.page + 1)}
                  aria-label="Next page"
                >Next</button>
              </nav>
            )}
          </div>
        )}
        {/* Map view */}
        {filters.view_mode === "map" && (
          <div className="flex-1 min-h-[28rem] lg:min-h-[36rem] flex flex-col bg-slate-50 rounded border shadow-inner">
            <div className="flex items-center justify-between p-2">
              <div className="font-bold text-lg text-blue-900">Map View (experimental)</div>
              <div className="text-sm text-slate-500">Pins represent search results. Click for details.</div>
            </div>
            {/* Map library not available, provide placeholder */}
            <div className="flex-1 flex justify-center items-center min-h-[400px]">
              <div className="relative w-full h-[400px] bg-gradient-to-br from-blue-100 to-blue-300 rounded-xl border border-blue-200 flex justify-center items-center overflow-hidden">
                {/* Simulate pins by distributing villa names in "random" positions */}
                {results.map((villa, i) => (
                  <div
                    key={villa.villa_id}
                    className="absolute group"
                    style={{
                      left: `${10 + ((i * 123) % 76)}%`,
                      top: `${12 + ((i * 321) % 76)}%`,
                      transform: "translate(-50%, -50%)",
                      cursor: "pointer",
                    }}
                    tabIndex={0}
                  >
                    <Link to={`/villa/${villa.villa_id}`} aria-label={`View details for ${villa.name}`}>
                      <div className="flex flex-col items-center group-hover:-translate-y-1 transition">
                        <span className="bg-blue-700 text-white px-3 py-1 rounded-full shadow text-xs font-bold">{villa.name.split(" ")[0]}</span>
                        <svg
                          width={26}
                          height={26}
                          className="mt-1"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth={2}
                        >
                          <circle cx={12} cy={12} r={10} stroke="#60a5fa" strokeWidth={2} />
                          <circle cx={12} cy={12} r={7} stroke="#2563eb" fill="#3b82f6" strokeWidth={2} />
                        </svg>
                      </div>
                    </Link>
                  </div>
                ))}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-2 text-slate-600 text-xs px-2 py-1 bg-white rounded shadow">
                  Interactive map will be enabled soon. Pan/zoom unavailable in MVP.
                </div>
              </div>
            </div>
            {/* Optional: summary list below map */}
            <div className="flex flex-wrap gap-3 justify-center mt-4">
              {results.map((villa) => (
                <Link
                  key={villa.villa_id}
                  to={`/villa/${villa.villa_id}`}
                  className="bg-white border px-3 py-2 rounded shadow hover:bg-blue-50 min-w-[160px] max-w-xs transition"
                  tabIndex={0}
                  aria-label={`${villa.name} details`}
                >
                  <div className="font-semibold truncate text-blue-900 mb-1">{villa.name}</div>
                  <div className="text-xs text-slate-500 truncate">{villa.location}</div>
                  <div className="text-xs text-blue-700 font-bold">${villa.price_per_night} / night</div>
                </Link>
              ))}
            </div>
            {/* Pagination, same as list */}
            {results.length > 0 && (
              <nav className="flex items-center justify-center gap-4 mt-6 select-none" aria-label="Pagination">
                <button
                  className="rounded px-3 py-1 font-semibold text-blue-700 bg-blue-50 border border-blue-100 hover:bg-blue-200 disabled:opacity-40"
                  disabled={filters.page <= 1}
                  onClick={() => setPage(filters.page - 1)}
                  aria-label="Previous page"
                >Prev</button>
                <span className="text-slate-700 font-semibold text-sm px-2">Page {filters.page}</span>
                <button
                  className="rounded px-3 py-1 font-semibold text-blue-700 bg-blue-50 border border-blue-100 hover:bg-blue-200 disabled:opacity-40"
                  disabled={results.length < VILLA_PAGE_SIZE}
                  onClick={() => setPage(filters.page + 1)}
                  aria-label="Next page"
                >Next</button>
              </nav>
            )}
          </div>
        )}
      </main>
    </>
  );
};

export default UV_SearchResults;