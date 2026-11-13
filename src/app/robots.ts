import type { MetadataRoute } from "next";
import { getAppUrl } from "@/shared/config/app-url";

export default function robots(): MetadataRoute.Robots {
  if (process.env.NODE_ENV !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  const origin = getAppUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/history", "/login", "/register", "/account/", "/api/", "/check/"] },
    sitemap: new URL("/sitemap.xml", origin).href,
  };
}
