import type { Metadata } from "next";
import { siteTitle, siteDescription } from "@/shared/config/metadata";
import { HomeContent } from "./HomeContent";

export const metadata: Metadata = {
  title: { absolute: siteTitle },
  description: siteDescription,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export default function Home() {
  return <HomeContent />;
}
