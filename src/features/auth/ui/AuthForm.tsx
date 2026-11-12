"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/shared/lib/auth-client";
import { useLocale } from "@/shared/i18n/LocaleProvider";

const inputClass = "mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function AuthForm({ mode }: { mode: "register" | "login" }) {
  const locale = useLocale();
  const ru = locale === "ru";
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
      setError(ru ? "Пароль должен содержать не менее 10 символов." : "Use at least 10 characters for your password.");
      return;
    }
    if (register && password !== data.get("confirmPassword")) {
      setError(ru ? "Пароли должны совпадать." : "Passwords must match.");
      return;
    }
    if (!email || !password || (register && !name)) {
      setError(ru ? "Заполните все поля." : "Please complete all fields.");
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
          ? (ru ? "Не удалось создать аккаунт. Проверьте данные или попробуйте войти." : "Unable to create an account. Check your details or try signing in.")
          : (ru ? "Не удалось войти. Проверьте email и пароль." : "Unable to sign in. Check your email and password and try again."));
        return;
      }
      router.replace("/check");
      router.refresh();
    } catch {
      setError(ru ? "Не удалось подключиться. Попробуйте ещё раз." : "Unable to connect. Please try again.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-12 text-foreground md:px-6">
      <section aria-labelledby="auth-title" className="h-fit w-full max-w-[440px] rounded-xl border border-border bg-surface p-6">
        <h1 id="auth-title" className="text-2xl font-semibold">{register ? (ru ? "Создать аккаунт" : "Create an account") : (ru ? "Войти" : "Sign in")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{ru ? "Сохраняйте результаты проверок в Истории. Также можно " : "Keep your assessments together in History. You can also "}<Link href="/check" className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "проверять без аккаунта" : "check without an account"}</Link>.</p>
        <form onSubmit={submit} aria-busy={pending} className="mt-6 space-y-4">
          {register && <div><label htmlFor="name" className="text-sm font-medium">{ru ? "Имя" : "Name"}</label><input className={inputClass} id="name" name="name" autoComplete="name" required maxLength={100} /></div>}
          <div><label htmlFor="email" className="text-sm font-medium">Email</label><input className={inputClass} id="email" name="email" type="email" autoComplete="email" required /></div>
          <div><label htmlFor="password" className="text-sm font-medium">{ru ? "Пароль" : "Password"}</label><input className={inputClass} id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 10 : undefined} maxLength={128} aria-describedby={register ? "password-hint" : undefined} required />{register && <p id="password-hint" className="mt-1 text-sm text-muted">{ru ? "Не менее 10 символов." : "Use at least 10 characters."}</p>}</div>
          {register && <div><label htmlFor="confirm-password" className="text-sm font-medium">{ru ? "Повторите пароль" : "Confirm password"}</label><input className={inputClass} id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required /></div>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={pending} className="min-h-11 w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60">{pending ? (ru ? "Подождите…" : "Please wait…") : register ? (ru ? "Создать аккаунт" : "Create account") : (ru ? "Войти" : "Sign in")}</button>
        </form>
        <p className="mt-5 text-sm text-muted">{register ? (ru ? "Уже есть аккаунт? " : "Already have an account? ") : (ru ? "Нет аккаунта? " : "Don't have an account? ")}<Link className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={register ? "/login" : "/register"}>{register ? (ru ? "Войти" : "Sign in") : (ru ? "Создать" : "Create one")}</Link></p>
      </section>
    </main>
  );
}
