import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/ui/AuthForm";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
