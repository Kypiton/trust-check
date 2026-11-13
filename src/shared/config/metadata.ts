import type { Metadata } from "next";
import { getAppUrl } from "./app-url";

export const siteTitle = "TrustCheck — Check suspicious links, messages and screenshots";
export const siteDescription = "Check suspicious messages, links and screenshots for signs of scams and phishing. Understand the risk and your next steps. An assessment, not a safety guarantee.";

export function rootMetadata(): Metadata {
  return {
    metadataBase: getAppUrl(),
    title: { default: siteTitle, template: "%s | TrustCheck" },
    description: siteDescription,
    // Canonicals are set only on the two public pages, never inherited by private results.
    openGraph: { title: siteTitle, description: siteDescription, siteName: "TrustCheck", type: "website" },
    twitter: { card: "summary_large_image", title: siteTitle, description: siteDescription, images: [{ url: "/opengraph-image", alt: "TrustCheck — Not sure if it’s real?" }] },
  };
}
