import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/widgets/header";
import { LocaleProvider } from "@/shared/i18n/LocaleProvider";
import { getRequestLocale } from "@/shared/i18n/server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "TrustCheck — Understand the risk", template: "%s | TrustCheck" },
  description: "Check suspicious messages, links, and screenshots for scam and phishing warning signs. Get a risk assessment and practical next steps, without needing an account.",
  openGraph: {
    title: "TrustCheck — Understand the risk",
    description: "Check suspicious messages, links, and screenshots. Understand warning signs and decide what to do next. A risk assessment, not a safety guarantee.",
    siteName: "TrustCheck",
    type: "website",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale} data-scroll-behavior="smooth" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var theme;try{theme=localStorage.getItem("trustcheck-theme")}catch(e){}var dark=theme==="dark"||(theme!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark)})();` }} />
      </head>
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={locale}>
          <Header />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
