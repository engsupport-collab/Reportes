"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import { crearUsuarioAction, type UsuarioState } from "@/actions/users";
import type { Empresa } from "@/lib/queries/companies";

function BotonCrear() {
  const { pending } = useFormStatus();
  const t = useTranslations("crearUsuarioForm");
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? t("creando") : t("crearUsuario")}
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
  const t = useTranslations("crearUsuarioForm");
  const tNav = useTranslations("nav");
  const [state, formAction] = useActionState<UsuarioState, FormData>(
    crearUsuarioAction,
    {},
  );
  const [copiado, setCopiado] = useState(false);
  const [role, setRole] = useState<"empleado" | "admin" | "contable">("empleado");

  if (state.credenciales) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/10 p-5">
        <p className="text-sm font-semibold text-success">{t("usuarioCreado")}</p>
        <p className="mt-2 rounded-lg bg-surface px-3 py-2.5 font-mono text-sm text-text">
          {state.credenciales}
        </p>
        <p className="mt-2 text-xs text-muted">{t("contrasenaUnaVez")}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(state.credenciales!);
              setCopiado(true);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text transition hover:bg-surface-muted"
          >
            {copiado ? t("copiado") : t("copiar")}
          </button>
          <a
            href="/admin/usuarios"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-muted hover:text-text"
          >
            {t("crearOtro")}
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
            {t("nombreCompleto")}
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
            {t("usuario")}
          </label>
          <input
            id="username"
            name="username"
            required
            maxLength={40}
            pattern="[a-z0-9._-]+"
            title={t("ayudaUsuario")}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-brand focus:outline-none"
            placeholder="maria.gomez"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-text">{t("rol")}</legend>
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
            {tNav("empleado")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text transition hover:bg-surface-muted has-checked:border-brand has-checked:bg-brand-soft has-checked:font-semibold has-checked:text-brand">
            <input
              type="radio"
              name="role"
              value="contable"
              className="accent-brand"
              onChange={() => setRole("contable")}
            />
            {tNav("contable")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text transition hover:bg-surface-muted has-checked:border-brand has-checked:bg-brand-soft has-checked:font-semibold has-checked:text-brand">
            <input
              type="radio"
              name="role"
              value="admin"
              className="accent-brand"
              onChange={() => setRole("admin")}
            />
            {tNav("administrador")}
          </label>
        </div>
      </fieldset>

      {/* Aplica a empleado y a contable: los dos necesitan empresa asignada
          porque hoy tienen los mismos permisos (implementación temporal — ver
          USER_ROLES en src/lib/roles.ts). Solo el admin ve las dos empresas
          siempre, por definición del rol, y no depende de esto para nada. Se
          oculta en vez de deshabilitarse para no dejar un bloque muerto en la
          pantalla. */}
      {role !== "admin" ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-text">
            {t("empresasAcceso")}
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
          {t("adminVeTodas")}
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
