import React from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link } from "react-router-dom";

// Minimal type for what we render in the footer links
interface LegalPageLink {
  page: string;
  title: string;
}

// Contact/support email (could use env or config if spec'd, but static for now)
const SUPPORT_EMAIL = "support@cliffbnb.com";

const fetchLegalPages = async (): Promise<LegalPageLink[]> => {
  const { data } = await axios.get(
    `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/legal-pages`,
    { params: { limit: 10 } }
  );
  // Defensive mapping; only select { page, title }
  return Array.isArray(data)
    ? data.map((item: any) => ({
        page: item.page,
        title: item.title,
      }))
    : [];
};

// SVG beach/wave accent
const WaveAccent: React.FC = () => (
  <svg
    className="w-full h-2 md:h-3 lg:h-4 text-blue-200"
    aria-hidden="true"
    viewBox="0 0 1440 60"
    fill="none"
    preserveAspectRatio="none"
    focusable="false"
  >
    <path
      d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z"
      fill="currentColor"
    />
  </svg>
);

const GV_Footer: React.FC = () => {
  // Query legal pages
  const {
    data: legalLinks,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<LegalPageLink[], Error>({
    queryKey: ["legal_pages", 10],
    queryFn: fetchLegalPages,
    staleTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
  });

  // Sort links - About/FAQ first, then order as returned, put Contact/Support last if needed
  let displayedLinks: LegalPageLink[] = [];
  if (Array.isArray(legalLinks)) {
    // Priority: about, faq, terms, privacy, contact (order matches priorities)
    const priorities = ["about", "faq", "terms", "privacy", "contact"];
    displayedLinks = [...legalLinks].sort((a, b) => {
      const ia = priorities.indexOf((a.page || "").toLowerCase());
      const ib = priorities.indexOf((b.page || "").toLowerCase());
      // Move known ones up, unknown ones go later
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  // Check if there's a "contact" page in the data, otherwise always add mailto
  const hasContact = displayedLinks.some(
    (l) => (l.page || "").toLowerCase() === "contact"
  );

  return (
    <>
      {/* Decorative accent */}
      <WaveAccent />
      <footer
        className="w-full bg-gradient-to-tr from-blue-50 to-white mt-0 text-slate-600 flex flex-col items-center pt-5 pb-2 px-2 border-t border-blue-100"
        aria-label="Site footer"
        tabIndex={0}
      >
        {/* Links: About / FAQ / Terms / Privacy / Contact */}
        <nav
          className="flex flex-wrap justify-center gap-4 md:gap-7 items-center text-sm md:text-base mb-2"
          aria-label="Footer main links"
          tabIndex={0}
        >
          {/* Loading/Error states */}
          {isLoading && (
            <span
              className="flex items-center gap-2 text-blue-700"
              aria-live="polite"
            >
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                role="status"
              >
                <circle
                  className="opacity-25"
                  cx="8"
                  cy="8"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M8 1a7 7 0 0 1 7 7h-2A5 5 0 0 0 8 3V1z"
                />
              </svg>
              Loading footer links...
            </span>
          )}
          {isError && (
            <span
              role="alert"
              aria-live="polite"
              className="flex items-center gap-2 text-red-700"
            >
              <span>Failed to load links</span>
              <button
                type="button"
                onClick={() => refetch()}
                className="underline text-blue-600 hover:text-blue-800"
                tabIndex={0}
                aria-label="Retry loading footer links"
              >
                Retry
              </button>
            </span>
          )}
          {!isLoading && !isError && Array.isArray(displayedLinks) && displayedLinks.length > 0 && (
            <>
              {displayedLinks
                .filter((l) => l.page && l.title)
                .map((l) => (
                  l.page.toLowerCase() === "contact" ? (
                    // Contact: link to mailto (if page is named "contact")
                    <a
                      key={l.page}
                      href={`mailto:${SUPPORT_EMAIL}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex={0}
                      aria-label={`Contact support at ${SUPPORT_EMAIL}`}
                      className="hover:text-blue-700 underline transition-colors"
                    >
                      {l.title}
                    </a>
                  ) : (
                    <Link
                      key={l.page}
                      to={`/info/${encodeURIComponent(l.page)}`}
                      tabIndex={0}
                      className="hover:text-blue-700 underline transition-colors"
                      aria-label={`Read more: ${l.title}`}
                    >
                      {l.title}
                    </Link>
                  )
                ))}
              {/* Always render static support link if no contact page found */}
              {!hasContact && (
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={0}
                  className="hover:text-blue-700 underline transition-colors"
                  aria-label={`Contact support at ${SUPPORT_EMAIL}`}
                >
                  Contact/Support
                </a>
              )}
            </>
          )}

          {/* No links? Static fallback */}
          {!isLoading && !isError && (!Array.isArray(displayedLinks) || displayedLinks.length === 0) && (
            <>
              <Link
                to="/info/about"
                className="hover:text-blue-700 underline transition-colors"
                tabIndex={0}
                aria-label="About CliffBnb"
              >
                About
              </Link>
              <Link
                to="/info/faq"
                className="hover:text-blue-700 underline transition-colors"
                tabIndex={0}
                aria-label="Frequently Asked Questions"
              >
                FAQ
              </Link>
              <Link
                to="/info/terms"
                className="hover:text-blue-700 underline transition-colors"
                tabIndex={0}
                aria-label="Terms of Service"
              >
                Terms
              </Link>
              <Link
                to="/info/privacy"
                className="hover:text-blue-700 underline transition-colors"
                tabIndex={0}
                aria-label="Privacy Policy"
              >
                Privacy
              </Link>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={0}
                className="hover:text-blue-700 underline transition-colors"
                aria-label={`Contact support at ${SUPPORT_EMAIL}`}
              >
                Contact/Support
              </a>
            </>
          )}
        </nav>
        {/* Copyright and brand */}
        <div className="text-xs md:text-sm text-slate-500 flex flex-col md:flex-row items-center gap-1 md:gap-2 mb-1">
          <span aria-label="Copyright">&copy; {new Date().getFullYear()} CliffBnb</span>
          <span className="hidden md:inline-block">&mdash;</span>
          <span aria-label="Brand subtitle">Cliff-side Beach House Villas</span>
        </div>
        {/* Simple decorative divider for small screens */}
        <div className="w-12 h-1 mt-2 mb-1 rounded-full bg-blue-100 md:hidden" aria-hidden="true" />
      </footer>
    </>
  );
};

export default GV_Footer;