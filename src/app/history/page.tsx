import { redirect } from "next/navigation";
import { getSession } from "@/shared/server/auth/session";

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <main className="bg-background text-foreground">
      <h1>History</h1>
    </main>
  );
}
