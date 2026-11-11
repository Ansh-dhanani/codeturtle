"use client";

/**
 * Umami Analytics loader + App Router pageview tracker.
 *
 * Env:
 *   NEXT_PUBLIC_UMAMI_WEBSITE_ID  - required; the website id from your Umami dashboard
 *   NEXT_PUBLIC_UMAMI_SRC         - script URL (default https://cloud.umami.is/script.js)
 *   NEXT_PUBLIC_UMAMI_DOMAINS     - optional comma-separated domain restriction (data-domains)
 *
 * If NEXT_PUBLIC_UMAMI_WEBSITE_ID is unset, this component renders nothing.
 */

import Script from "next/script";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import "@/lib/analytics";

const WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const SRC = process.env.NEXT_PUBLIC_UMAMI_SRC ?? "https://cloud.umami.is/script.js";
const DOMAINS = process.env.NEXT_PUBLIC_UMAMI_DOMAINS;

/** Umami records the first pageview on script load; skip the initial effect fire to avoid double counting. */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!WEBSITE_ID) return;
    // Umami v2: track() with no arguments emits a pageview for the current URL.
    window.umami?.track();
  }, [pathname, searchParams]);

  return null;
}

export function Umami() {
  if (!WEBSITE_ID) return null;

  return (
    <>
      <Script
        src={SRC}
        data-website-id={WEBSITE_ID}
        {...(DOMAINS ? { "data-domains": DOMAINS } : {})}
        strategy="afterInteractive"
      />
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
    </>
  );
}
