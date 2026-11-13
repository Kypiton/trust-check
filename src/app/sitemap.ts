import type { MetadataRoute } from "next";
import { getAppUrl } from "@/shared/config/app-url";

export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.NODE_ENV !== "production") return [];
  const origin = getAppUrl();
  return ["/", "/check"].map(path => ({ url: new URL(path, origin).href }));
}
