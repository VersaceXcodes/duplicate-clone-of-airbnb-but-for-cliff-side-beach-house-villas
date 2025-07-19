import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAppStore } from "@/store/main";
import { Link, useNavigate } from "react-router-dom";

// --- Types ---
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
}
interface SearchQuery {
  search_id: string;
  user_id: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  price_min: number | null;
  price_max: number | null;
  amenities: string | null;
  sort_by: string | null;
  map_bounds: string | null;
  page: number | null;
  view_mode: string | null;
  created_at: string;
}
interface PopularDestination {
  location: string;
  count: number;
}
// --- Constants ---
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// --- Utils ---
const toDateInputValue = (date: string | null) =>
  date ? date.split("T")[0] : "";

// --- Main Component ---
const UV_Homepage: React.FC = () => {
  // --- Zustand Global Store (only user methods via stable selectors) ---
  const user = useAppStore((s) => s.user);
  const set_search_query = useAppStore((s) => s.set_search_query);

  // --- Local State for Search Bar ---
  const [location, setLocation] = React.useState<string>("");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");
  const [adults, setAdults] = React.useState<number>(1);
  const [children, setChildren] = React.useState<number>(0);
  const [infants, setInfants] = React.useState<number>(0);

  const [searchError, setSearchError] = React.useState<string | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- Fetch Featured Villas (React Query) ---
  const featuredVillasQuery = useQuery<Villa[], Error>({
    queryKey: ["featured_villas"],
    queryFn: async () => {
      const { data } = await axios.get<Villa[]>(
        `${API_BASE}/villas`,
        {
          params: {
            status: "published",
            limit: 8,
            sort_by: "average_rating",
            sort_order: "desc",
          },
        }
      );
      return data;
    },
    refetchOnWindowFocus: false,
  });

  // --- Subscribe to WS updates for /villas/updated (realtime refresh for featured) ---
  React.useEffect(() => {
    // Use socket from zustand if present
    const socket = useAppStore.getState().socket;
    if (!socket) return;
    // Wrap in event listener
    const handler = (payload: any) => {
      queryClient.invalidateQueries({ queryKey: ["featured_villas"] });
    };
    socket.on("villas/updated", handler);
    return () => {
      socket.off("villas/updated", handler);
    };
  }, [queryClient]);

  // --- Fetch Recent Search Queries (Popular Destinations) ---
  const popularDestinationsQuery = useQuery<PopularDestination[], Error>({
    queryKey: ["popular_destinations"],
    queryFn: async () => {
      // We'll fetch more than needed for deduplication
      const { data } = await axios.get<SearchQuery[]>(
        `${API_BASE}/search-queries`,
        {
          params: {
            limit: 32,
            sort_by: "created_at",
            sort_order: "desc",
          },
        }
      );
      const map: { [location: string]: number } = {};
      for (const sq of data) {
        if (!sq.location) continue;
        map[sq.location] = (map[sq.location] || 0) + 1;
      }
      return Object.entries(map)
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    },
    refetchOnWindowFocus: false,
  });

  // --- Search Bar Handlers ---
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    // Sanitize inputs
    const trimmedLoc = location.trim();
    if (!trimmedLoc) {
      setSearchError("Please enter a location to search.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setSearchError("End date must be after start date.");
      return;
    }

    setSearchError(null);
    // Save date range as YYYY-MM-DD
    set_search_query({
      location: trimmedLoc,
      date_range: {
        start_date: startDate || null,
        end_date: endDate || null,
      },
      guest_count: {
        adults,
        children,
        infants,
      },
      page: 1,
      view_mode: "list",
    });

    // Construct query params for /search
    const params = new URLSearchParams();
    params.append("location", trimmedLoc);
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    params.append("adults", String(adults));
    if (children > 0) params.append("children", String(children));
    if (infants > 0) params.append("infants", String(infants));

    navigate(`/search?${params.toString()}`);
  };

  // --- Search Input onChange clears error ---
  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchError(null);
    setLocation(e.target.value);
  };
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchError(null);
    setStartDate(e.target.value);
  };
  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchError(null);
    setEndDate(e.target.value);
  };
  const handleAdultsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchError(null);
    setAdults(Number(e.target.value));
  };
  const handleChildrenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchError(null);
    setChildren(Number(e.target.value));
  };
  const handleInfantsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchError(null);
    setInfants(Number(e.target.value));
  };

  // --- Render ---
  return (
    <>
      {/* HERO SECTION */}
      <section
        className="relative w-full min-h-[370px] md:min-h-[450px] bg-gradient-to-b from-blue-100/90 to-white
          flex flex-col items-center justify-center overflow-hidden"
      >
        <img
          src="https://picsum.photos/seed/cliffbnb-hero/1920/600"
          alt="Cliff-side Villa"
          className="absolute top-0 left-0 w-full h-full object-cover z-0 opacity-65 pointer-events-none"
          loading="eager"
          decoding="async"
        />
        <div className="relative z-10 max-w-2xl text-center mt-14 md:mt-24">
          <h1 className="font-bold text-3xl md:text-5xl text-gray-900 drop-shadow-lg">
            CliffBnb: Stay on the Edge of Paradise
          </h1>
          <p className="mt-4 text-base md:text-lg text-gray-800 font-medium">
            Discover and book breathtaking cliff-side beach house villas &mdash; curated stays in the world's most stunning destinations.
          </p>
        </div>
        {/* SEARCH BAR */}
        <form
          className="relative z-20 mt-10 md:mt-16 w-full flex justify-center"
          onSubmit={handleSearch}
          aria-label="Search cliff-side villas"
        >
          <div
            className="flex flex-col md:flex-row items-center gap-3 bg-white/95 border border-gray-200 rounded-lg shadow-lg px-5 py-4 w-full max-w-3xl backdrop-blur"
          >
            {/* Location */}
            <div className="flex-1">
              <input
                type="text"
                className="w-full py-2 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-900"
                placeholder="Where to? (city, island, or region)"
                value={location}
                onChange={handleLocationChange}
                minLength={2}
                maxLength={128}
                required
                aria-label="Location"
              />
            </div>
            {/* Date Range */}
            <div className="flex flex-row gap-2">
              <input
                type="date"
                className="w-full md:w-32 py-2 px-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-900"
                aria-label="Check-in date"
                value={startDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={handleStartDateChange}
              />
              <input
                type="date"
                className="w-full md:w-32 py-2 px-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-900"
                aria-label="Check-out date"
                value={endDate}
                min={startDate || new Date().toISOString().split("T")[0]}
                onChange={handleEndDateChange}
              />
            </div>
            {/* Guest Selector */}
            <div className="flex flex-row gap-2 items-center">
              <input
                type="number"
                className="w-14 py-2 px-1 border border-gray-300 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-900"
                min={1}
                max={16}
                value={adults}
                onChange={handleAdultsChange}
                aria-label="Adults"
                title="Number of adults"
              />
              <span className="text-gray-600 text-sm">Adults</span>
              <input
                type="number"
                className="w-12 py-2 px-1 border border-gray-300 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-900"
                min={0}
                max={10}
                value={children}
                onChange={handleChildrenChange}
                aria-label="Children"
                title="Number of children"
              />
              <span className="text-gray-600 text-sm">Children</span>
              <input
                type="number"
                className="w-12 py-2 px-1 border border-gray-300 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-900"
                min={0}
                max={5}
                value={infants}
                onChange={handleInfantsChange}
                aria-label="Infants"
                title="Number of infants"
              />
              <span className="text-gray-600 text-sm">Infants</span>
            </div>
            {/* Search Button */}
            <button
              type="submit"
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-md px-4 py-2 transition-colors ml-0 md:ml-3"
              aria-label="Search Villas"
              tabIndex={0}
            >
              Search
            </button>
          </div>
        </form>
        {/* Search error (accessibility/aria-live) */}
        <div
          role="alert"
          aria-live="polite"
          className="mt-2 text-red-600 text-sm min-h-[1.5em] text-center"
        >
          {searchError && <span>{searchError}</span>}
        </div>
      </section>

      {/* FEATURED VILLAS SECTION */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <h2 className="text-2xl font-extrabold text-gray-900 mb-5">
          Featured Cliff-side Villas
        </h2>
        {featuredVillasQuery.isLoading ? (
          <div className="flex justify-center items-center min-h-[180px]">
            <svg className="animate-spin h-8 w-8 text-sky-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </div>
        ) : featuredVillasQuery.isError ? (
          <div className="text-red-600 py-8 text-center" aria-live="polite">
            Failed to load featured villas. Please refresh or try later.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {(featuredVillasQuery.data || []).map((villa) => (
              <Link
                key={villa.villa_id}
                to={`/villa/${villa.villa_id}`}
                className="flex flex-col rounded-xl bg-white hover:shadow-2xl transition-shadow duration-150 border border-slate-100 overflow-hidden group h-full"
                tabIndex={0}
                aria-label={`View details for villa ${villa.name}`}
              >
                <img
                  src={`https://picsum.photos/seed/villa-${villa.villa_id}/600/400`}
                  alt={`${villa.name} - villa preview`}
                  className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-150"
                  loading="lazy"
                  decoding="async"
                />
                <div className="flex-1 flex flex-col p-4">
                  <h3 className="font-bold text-lg truncate mb-1 text-gray-900">{villa.name}</h3>
                  {villa.subtitle && (
                    <div className="text-sm text-blue-800 mb-1 truncate">{villa.subtitle}</div>
                  )}
                  <div className="text-sm text-gray-500 mb-1">{villa.location}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-auto">
                    <div className="flex items-center gap-1 text-yellow-500 text-sm">
                      <svg aria-hidden="true" focusable="false" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 17.25l6.18 3.73-1.64-7.03L22 9.25l-7.19-.61L12 2.5 9.19 8.64 2 9.25l5.46 4.7-1.64 7.03z" />
                      </svg>
                      <span>{villa.average_rating.toFixed(1)}</span>
                      <span className="text-gray-400">({villa.review_count})</span>
                    </div>
                    <span className="text-sky-600 font-bold text-base ml-auto">
                      ${villa.price_per_night}/night
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* WHY CLIFF VILLAS / TRUST / PROMO SECTION */}
      <section className="bg-sky-50 py-10 lg:py-14 border-t border-b border-blue-100">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center gap-8 justify-between px-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-sky-900 mb-2">
              Why Cliff Villas?
            </h2>
            <ul className="mt-3 space-y-2 text-sky-800 text-lg list-disc pl-6">
              <li>
                <b className="text-sky-600 font-semibold">Spectacular Views:</b>&nbsp; Every villa offers stunning cliffside panoramas of turquoise waters, sunsets, and pristine beaches.
              </li>
              <li>
                <b className="text-sky-600 font-semibold">Handpicked Exclusives:</b>&nbsp; Listings are verified for safety, amenities, and access—no generic homes.
              </li>
              <li>
                <b className="text-sky-600 font-semibold">Seamless & Secure Booking:</b>&nbsp; Transparent pricing, secure payments, and responsive hosts.
              </li>
              <li>
                <b className="text-sky-600 font-semibold">Unique Experiences:</b>&nbsp; CliffBnb is the only platform focused on breathtaking cliff-top living and luxury coastal escapes.
              </li>
            </ul>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <img
              src="https://picsum.photos/seed/cliffbnb-why/480/320"
              alt="A view from a cliffside villa"
              className="rounded-xl shadow-xl w-full max-w-xs md:max-w-md object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </section>

      {/* POPULAR DESTINATIONS SECTION */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <div className="flex flex-row items-center gap-2 mb-5">
          <h2 className="text-2xl font-extrabold text-gray-900">Popular Destinations</h2>
          <span className="text-sm text-gray-500">(Quick Find)</span>
        </div>
        {popularDestinationsQuery.isLoading ? (
          <div className="flex justify-center items-center min-h-[90px]">
            <svg className="animate-spin h-7 w-7 text-sky-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </div>
        ) : popularDestinationsQuery.isError ? (
          <div className="text-red-600">Could not load destinations.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-2">
            {(popularDestinationsQuery.data || []).map((dest, idx) => (
              <Link
                key={dest.location}
                to={`/search?location=${encodeURIComponent(dest.location)}`}
                className="group bg-blue-100 hover:bg-blue-200 rounded-lg px-4 py-3 flex flex-col items-center justify-center text-center font-medium text-sky-900 shadow transition"
                tabIndex={0}
                aria-label={`Search for villas in ${dest.location}`}
              >
                <span className="text-lg font-bold truncate">{dest.location}</span>
                <span className="text-sm text-blue-700 mt-1 group-hover:underline">
                  {dest.count} search{dest.count !== 1 ? "es" : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ABOUT / BECOME A HOST / FINAL CTA SECTION */}
      <section className="bg-white border-t border-blue-100 py-8 px-4 flex flex-col md:flex-row items-center justify-between gap-6 max-w-7xl mx-auto">
        <div className="flex-1 md:pr-8">
          <h3 className="text-xl font-bold mb-1 text-sky-900">About CliffBnb</h3>
          <div className="text-gray-700 text-base mb-2">
            CliffBnb is the home for curated cliff-side beach house villas. Travel and host with confidence—every listing is unique, every view unforgettable.
          </div>
          <Link
            to="/info/about"
            className="inline-block text-sky-600 hover:text-sky-800 hover:underline font-semibold text-sm focus:outline-none"
            aria-label="Learn more about CliffBnb"
            tabIndex={0}
          >
            Learn more about us &rarr;
          </Link>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Host CTA logic */}
          {user && user.role === "host" ? (
            <Link
              to="/dashboard/host"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-colors text-lg focus:outline-none"
              aria-label="Manage your villas"
              tabIndex={0}
            >
              Manage Your Villas
            </Link>
          ) : (
            <Link
              to={user ? "/dashboard/host" : "/auth?mode=register"}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-colors text-lg focus:outline-none"
              aria-label={user ? "Become a host" : "Sign up and become a host"}
              tabIndex={0}
            >
              Become a Host
            </Link>
          )}
          <div className="mt-3 text-gray-700 text-base text-center max-w-xs">
            Share your cliff-side paradise with the world.<br />
            Listing is fast, easy, and free!
          </div>
        </div>
      </section>
    </>
  );
};

export default UV_Homepage;