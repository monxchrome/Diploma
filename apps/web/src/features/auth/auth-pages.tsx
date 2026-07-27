"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";

import { useAuth } from "./auth-provider";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = loginSchema.extend({
  displayName: z.string().trim().min(1, "Display name is required").max(120),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .regex(/[a-z]/, "Add a lowercase letter")
    .regex(/[A-Z]/, "Add an uppercase letter")
    .regex(/\d/, "Add a number")
    .regex(/[^A-Za-z0-9]/, "Add a symbol"),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    defaultValues: {
      email: "",
      password: "",
    },
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  async function onSubmit(values: LoginValues): Promise<void> {
    setApiError(null);

    try {
      await login(values.email, values.password);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to sign in");
    }
  }

  return (
    <AuthFormShell
      eyebrow="Welcome back"
      title="Sign in"
      switchHref="/register"
      switchLabel="Create account"
      switchText="New here?"
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      >
        <FieldError message={apiError} />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Email
          <input
            {...form.register("email")}
            autoComplete="email"
            className={inputClasses}
            type="email"
          />
          <FieldError message={form.formState.errors.email?.message} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Password
          <PasswordInput
            autoComplete="current-password"
            register={form.register("password")}
            show={showPassword}
            toggle={() => setShowPassword((value) => !value)}
          />
          <FieldError message={form.formState.errors.password?.message} />
        </label>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <LogIn className="h-4 w-4" aria-hidden="true" />
          {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthFormShell>
  );
}

export function RegisterPage() {
  const { register, status } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const form = useForm<RegisterValues>({
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
    },
    resolver: zodResolver(registerSchema),
  });

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  async function onSubmit(values: RegisterValues): Promise<void> {
    setApiError(null);

    try {
      await register(values.email, values.password, values.displayName);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to create account");
    }
  }

  return (
    <AuthFormShell
      eyebrow="Start your workspace"
      title="Create account"
      switchHref="/login"
      switchLabel="Sign in"
      switchText="Already registered?"
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      >
        <FieldError message={apiError} />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Display name
          <input
            {...form.register("displayName")}
            autoComplete="name"
            className={inputClasses}
            type="text"
          />
          <FieldError message={form.formState.errors.displayName?.message} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Email
          <input
            {...form.register("email")}
            autoComplete="email"
            className={inputClasses}
            type="email"
          />
          <FieldError message={form.formState.errors.email?.message} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Password
          <PasswordInput
            autoComplete="new-password"
            register={form.register("password")}
            show={showPassword}
            toggle={() => setShowPassword((value) => !value)}
          />
          <FieldError message={form.formState.errors.password?.message} />
        </label>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {form.formState.isSubmitting ? "Creating..." : "Create account"}
        </Button>
      </form>
    </AuthFormShell>
  );
}

function AuthFormShell({
  children,
  eyebrow,
  switchHref,
  switchLabel,
  switchText,
  title,
}: Readonly<{
  children: React.ReactNode;
  eyebrow: string;
  switchHref: string;
  switchLabel: string;
  switchText: string;
  title: string;
}>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-teal-700">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h1>
        <div className="mt-6">{children}</div>
        <p className="mt-5 text-sm text-slate-600">
          {switchText}{" "}
          <Link className="font-medium text-teal-700 hover:text-teal-900" href={switchHref}>
            {switchLabel}
          </Link>
        </p>
      </section>
    </main>
  );
}

function PasswordInput({
  autoComplete,
  register,
  show,
  toggle,
}: Readonly<{
  autoComplete: string;
  register: UseFormRegisterReturn;
  show: boolean;
  toggle: () => void;
}>) {
  return (
    <div className="relative">
      <input
        {...register}
        autoComplete={autoComplete}
        className={`${inputClasses} pr-11`}
        type={show ? "text" : "password"}
      />
      <button
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        onClick={toggle}
        type="button"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function FieldError({ message }: Readonly<{ message?: string | null }>) {
  if (!message) {
    return null;
  }

  return <p className="text-sm font-medium text-red-700">{message}</p>;
}

const inputClasses =
  "h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-teal-700 focus:ring-2 focus:ring-teal-100";
