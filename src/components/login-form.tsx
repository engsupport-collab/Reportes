"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { type LoginState, loginAction } from "@/actions/auth";

/**
 * Campos altos y con aire: es la única pantalla que se usa de pie, con una
 * mano, y a veces con guantes. Un campo de 40px de alto se falla al tocarlo.
 *
 * Al pasar el puntero se enciende el borde en turquesa. No es decoración: el
 * campo de texto es el único elemento de la página que no parece pulsable,
 * porque no tiene la forma de un botón, y esa respuesta al pasar por encima
 * es la que dice que sí lo es.
 */
const CAMPO =
  "w-full rounded-xl border-2 border-border bg-surface px-4 py-3.5 text-base " +
  "text-text placeholder:text-muted transition " +
  "hover:border-brand/60 " +
  "focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

function BotonEntrar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand px-4 py-3.5 text-base font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Verificando…" : "Ingresar"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="username"
          className="block text-sm font-semibold text-text"
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
          className={CAMPO}
          placeholder="Escribe tu usuario"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-semibold text-text"
        >
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={CAMPO}
          placeholder="Escribe tu contraseña"
        />
      </div>

      {state.error ? (
        // role="alert" para que los lectores de pantalla anuncien el error
        // apenas aparece, sin que el usuario tenga que ir a buscarlo.
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <div className="pt-1">
        <BotonEntrar />
      </div>
    </form>
  );
}
