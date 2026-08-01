"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { type LoginState, loginAction } from "@/actions/auth";

function BotonEntrar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Verificando…" : "Entrar"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="username"
          className="block text-sm font-medium text-text"
        >
          Usuario
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          placeholder="tu.usuario"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-text"
        >
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          placeholder="••••••••"
        />
      </div>

      {state.error ? (
        // role="alert" para que los lectores de pantalla anuncien el error
        // apenas aparece, sin que el usuario tenga que ir a buscarlo.
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <BotonEntrar />
    </form>
  );
}
