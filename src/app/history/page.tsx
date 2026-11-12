import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/shared/server/auth/session";
import { getUserCheckHistory } from "@/entities/check/server/get-user-check-history";
import { CheckHistory } from "@/widgets/check-history";
import { getRequestLocale } from "@/shared/i18n/server";

export const metadata: Metadata = {
  title: "History",
  description: "Review your saved TrustCheck risk assessments.",
  robots: { index: false, follow: false },
};

export default async function HistoryPage() {
  const [session, locale] = await Promise.all([getSession(), getRequestLocale()]);
  if (!session) redirect("/login");
  const checks = await getUserCheckHistory(session.user.id);
  return <CheckHistory checks={checks} locale={locale} />;
}
