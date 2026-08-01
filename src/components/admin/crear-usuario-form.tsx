"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { crearUsuarioAction, type UsuarioState } from "@/actions/users";
import type { Empresa } from "@/lib/queries/companies";

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creando…" : "Crear usuario"}
    </button>
  );
}

/**
 * Alta de un empleado o admin.
 *
 * Tras crear, las credenciales se muestran una sola vez en pantalla — no hay
 * otro lugar del sistema donde se pueda volver a ver esa contraseña, porque no
 * se guarda en ningún lado en texto plano. El admin tiene que copiarlas ahí
 * mismo y entregárselas a la persona.
 */
export function CrearUsuarioForm({ empresas }: { empresas: Empresa[] }) {
  const [state, formAction] = useActionState<UsuarioState, FormData>(
    crearUsuarioAction,
    {},
  );
  const [copiado, setCopiado] = useState(false);
  const [role, setRole] = useState<"empleado" | "admin">("empleado");

  if (state.credenciales) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/10 p-5">
        <p className="text-sm font-semibold text-success">Usuario creado</p>
        <p className="mt-2 rounded-lg bg-surface px-3 py-2.5 font-mono text-sm text-text">
          {state.credenciales}
        </p>
        <p className="mt-2 text-xs text-muted">
          Esta contraseña no se puede volver a mostrar. Cópiala y entrégasela a
          la persona ahora.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(state.credenciales!);
              setCopiado(true);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text transition hover:bg-surface-muted"
          >
            {copiado ? "Copiado" : "Copiar"}
          </button>
          <a
            href="/admin/usuarios"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-muted hover:text-text"
          >
            Crear otro usuario
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="fullName" className="block text-sm font-medium text-text">
            Nombre completo
          </label>
          <input
            id="fullName"
            name="fullName"
            required
            maxLength={120}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-brand focus:outline-none"
            placeholder="María Gómez"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="username" className="block text-sm font-medium text-text">
            Usuario
          </label>
          <input
            id="username"
            name="username"
            required
            maxLength={40}
            pattern="[a-z0-9._-]+"
            title="Solo minúsculas, números, puntos, guiones y guiones bajos"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-brand focus:outline-none"
            placeholder="maria.gomez"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-text">Rol</legend>
        <div className="flex gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text transition hover:bg-surface-muted has-checked:border-brand has-checked:bg-brand-soft has-checked:font-semibold has-checked:text-brand">
            <input
              type="radio"
              name="role"
              value="empleado"
              defaultChecked
              className="accent-brand"
              onChange={() => setRole("empleado")}
            />
            Empleado
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text transition hover:bg-surface-muted has-checked:border-brand has-checked:bg-brand-soft has-checked:font-semibold has-checked:text-brand">
            <input
              type="radio"
              name="role"
              value="admin"
              className="accent-brand"
              onChange={() => setRole("admin")}
            />
            Administrador
          </label>
        </div>
      </fieldset>

      {/* Solo aplica a un empleado: el admin ve las dos empresas siempre, por
          definición del rol, y no depende de esto para nada. Se oculta en vez
          de deshabilitarse para no dejar un bloque muerto en la pantalla. */}
      {role === "empleado" ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-text">
            Empresas a las que tiene acceso
          </legend>
          <div className="flex flex-wrap gap-2">
            {empresas.map((e) => (
              <label
                key={e.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text transition hover:bg-surface-muted has-checked:border-brand has-checked:bg-brand-soft has-checked:font-semibold has-checked:text-brand"
              >
                <input type="checkbox" name="companyIds" value={e.id} className="accent-brand" />
                {e.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-xs text-muted">
          Un administrador ve las dos empresas siempre; no hace falta elegir.
        </p>
      )}

      {state.error ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <BotonCrear />
    </form>
  );
}
