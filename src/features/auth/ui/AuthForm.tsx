"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/shared/lib/auth-client";

const inputClass = "mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function AuthForm({ mode }: { mode: "register" | "login" }) {
  const register = mode === "register";
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();
    setError("");
    if (register && password.length < 10) {
      setError("Use at least 10 characters for your password.");
      return;
    }
    if (register && password !== data.get("confirmPassword")) {
      setError("Passwords must match.");
      return;
    }
    if (!email || !password || (register && !name)) {
      setError("Please complete all fields.");
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      const result = register
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(register
          ? "Unable to create an account. Check your details or try signing in."
          : "Unable to sign in. Check your email and password and try again.");
        return;
      }
      router.replace("/check");
      router.refresh();
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-12 text-foreground md:px-6">
      <section aria-labelledby="auth-title" className="h-fit w-full max-w-[440px] rounded-xl border border-border bg-surface p-6">
        <h1 id="auth-title" className="text-2xl font-semibold">{register ? "Create an account" : "Sign in"}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Keep your assessments together in History. You can also <Link href="/check" className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">check without an account</Link>.</p>
        <form onSubmit={submit} aria-busy={pending} className="mt-6 space-y-4">
          {register && <div><label htmlFor="name" className="text-sm font-medium">Name</label><input className={inputClass} id="name" name="name" autoComplete="name" required maxLength={100} /></div>}
          <div><label htmlFor="email" className="text-sm font-medium">Email</label><input className={inputClass} id="email" name="email" type="email" autoComplete="email" required /></div>
          <div><label htmlFor="password" className="text-sm font-medium">Password</label><input className={inputClass} id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 10 : undefined} maxLength={128} aria-describedby={register ? "password-hint" : undefined} required />{register && <p id="password-hint" className="mt-1 text-sm text-muted">Use at least 10 characters.</p>}</div>
          {register && <div><label htmlFor="confirm-password" className="text-sm font-medium">Confirm password</label><input className={inputClass} id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required /></div>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={pending} className="min-h-11 w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60">{pending ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
        </form>
        <p className="mt-5 text-sm text-muted">{register ? "Already have an account? " : "Don't have an account? "}<Link className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={register ? "/login" : "/register"}>{register ? "Sign in" : "Create one"}</Link></p>
      </section>
    </main>
  );
}
