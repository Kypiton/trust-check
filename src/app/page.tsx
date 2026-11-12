import type { Metadata } from "next";
import { HomeContent } from "./HomeContent";

export const metadata: Metadata = {
  title: { absolute: "TrustCheck — Scam & phishing risk checker" },
  description: "Check suspicious messages, links, and screenshots for scam and phishing warning signs. Get a clear risk assessment and practical next steps.",
};

export default function Home() {
  return <HomeContent />;
}
