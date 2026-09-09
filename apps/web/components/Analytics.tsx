import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import Script from "next/script";

/**
 * Aggregate traffic counting.
 *
 * Every supported provider is cookieless and records page views without building a profile of
 * the visitor, which is what keeps the privacy policy short and true. Nothing is loaded unless
 * NEXT_PUBLIC_ANALYTICS_ID is set, so local development and forks send no traffic anywhere.
 *
 * Configure in .env.local or the host's environment:
 *   NEXT_PUBLIC_ANALYTICS_PROVIDER = vercel | cloudflare | plausible | umami
 *   NEXT_PUBLIC_ANALYTICS_ID       = the provider's site token (not needed for vercel)
 *   NEXT_PUBLIC_ANALYTICS_HOST     = script origin, for self-hosted Umami or Plausible
 *
 * "vercel" is the default when nothing is set, because that is where this is deployed and it
 * needs no token: Vercel injects the endpoint at build time. It still does nothing locally, since
 * the script only reports from a Vercel deployment.
 */
export function Analytics() {
  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER ?? "vercel";
  const id = process.env.NEXT_PUBLIC_ANALYTICS_ID;

  // Vercel is the only provider that needs no token, so it is checked before the token guard.
  if (provider === "vercel") return <VercelAnalytics />;
  if (!id) return null;

  switch (provider) {
    case "cloudflare":
      return (
        <Script
          id="analytics"
          strategy="afterInteractive"
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon={JSON.stringify({ token: id })}
        />
      );

    case "plausible":
      return (
        <Script
          id="analytics"
          strategy="afterInteractive"
          defer
          data-domain={id}
          src={`${process.env.NEXT_PUBLIC_ANALYTICS_HOST ?? "https://plausible.io"}/js/script.js`}
        />
      );

    case "umami":
      return (
        <Script
          id="analytics"
          strategy="afterInteractive"
          defer
          data-website-id={id}
          src={`${process.env.NEXT_PUBLIC_ANALYTICS_HOST ?? "https://cloud.umami.is"}/script.js`}
        />
      );

    default:
      return null;
  }
}
