import Script from "next/script";

/**
 * Aggregate traffic counting.
 *
 * Every supported provider is cookieless and records page views without building a profile of
 * the visitor, which is what keeps the privacy policy short and true. Nothing is loaded unless
 * NEXT_PUBLIC_ANALYTICS_ID is set, so local development and forks send no traffic anywhere.
 *
 * Configure in .env.local or the host's environment:
 *   NEXT_PUBLIC_ANALYTICS_PROVIDER = cloudflare | plausible | umami
 *   NEXT_PUBLIC_ANALYTICS_ID       = the provider's site token
 *   NEXT_PUBLIC_ANALYTICS_HOST     = script origin, for self-hosted Umami or Plausible
 */
export function Analytics() {
  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER;
  const id = process.env.NEXT_PUBLIC_ANALYTICS_ID;
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
