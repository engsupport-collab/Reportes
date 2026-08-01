"use client";

import { useState, useTransition } from "react";

import {
  alternarAccesoEmpresaAction,
  alternarActivoAction,
  resetearContrasenaAction,
} from "@/actions/users";
import type { Empresa } from "@/lib/queries/companies";
import type { UsuarioConAccesos } from "@/lib/queries/users";

function ToggleEmpresa({
  usuario,
  empresa,
}: {
  usuario: UsuarioConAccesos;
  empresa: Empresa;
}) {
  const [pendiente, startTransition] = useTransition();
  const tieneAcceso = usuario.empresas.includes(empresa.id);

  return (
    <form
      action={(fd) => startTransition(() => alternarAccesoEmpresaAction(usuario.id, empresa.id, fd))}
    >
      <input type="hidden" name="otorgar" value={tieneAcceso ? "0" : "1"} />
      <button
        type="submit"
        disabled={pendiente}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
          tieneAcceso
            ? "border-brand bg-brand-soft text-brand"
            : "border-border text-muted hover:bg-surface-muted"
        }`}
      >
        {pendiente ? "…" : empresa.name}
      </button>
    </form>
  );
}

function BotonActivo({ usuario, esUnoMismo }: { usuario: UsuarioConAccesos; esUnoMismo: boolean }) {
  const [pendiente, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente || esUnoMismo}
      title={esUnoMismo ? "No puedes desactivar tu propia cuenta" : undefined}
      onClick={() => {
        const accion = usuario.isActive ? "desactivar" : "reactivar";
        if (!window.confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} a ${usuario.fullName}?`)) {
          return;
        }
        startTransition(() => alternarActivoAction(usuario.id));
      }}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        usuario.isActive
          ? "border-border text-muted hover:border-danger/40 hover:text-danger"
          : "border-success/40 text-success hover:bg-success/10"
      }`}
    >
      {pendiente ? "…" : usuario.isActive ? "Desactivar" : "Reactivar"}
    </button>
  );
}

function BotonResetear({ usuario }: { usuario: UsuarioConAccesos }) {
  const [pendiente, startTransition] = useTransition();
  const [credenciales, setCredenciales] = useState<string | null>(null);

  if (credenciales) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs">
        <p className="font-mono text-text">{credenciales}</p>
        <button
          type="button"
          onClick={() => setCredenciales(null)}
          className="mt-1 font-medium text-success hover:underline"
        >
          Listo
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        if (!window.confirm(`¿Generar una contraseña nueva para ${usuario.fullName}? La anterior dejará de servir.`)) {
          return;
        }
        startTransition(async () => {
          const r = await resetearContrasenaAction(usuario.id);
          if (r.credenciales) setCredenciales(r.credenciales);
        });
      }}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-muted hover:text-text disabled:opacity-50"
    >
      {pendiente ? "…" : "Resetear contraseña"}
    </button>
  );
}

export function UsersTable({
  usuarios,
  empresas,
  idUsuarioActual,
}: {
  usuarios: UsuarioConAccesos[];
  empresas: Empresa[];
  idUsuarioActual: string;
}) {
  return (
    <div className="space-y-3">
      {usuarios.map((u) => {
        const esUnoMismo = u.id === idUsuarioActual;

        return (
          <div
            key={u.id}
            className={`rounded-2xl border p-4 ${
              u.isActive ? "border-border bg-surface" : "border-border bg-surface-muted opacity-70"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">
                  {u.fullName}
                  {esUnoMismo ? <span className="ml-2 text-xs font-normal text-muted">(tú)</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {u.username} · {u.role === "admin" ? "Administrador" : "Empleado"}
                  {!u.isActive ? " · Desactivado" : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <BotonResetear usuario={u} />
                <BotonActivo usuario={u} esUnoMismo={esUnoMismo} />
              </div>
            </div>

            {/* Un admin no depende de user_companies para nada: ve las dos
                empresas siempre, por definición del rol. Mostrarle
                interruptores de acceso sugeriría que algo cambia al tocarlos,
                y no es así. */}
            {u.role === "empleado" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  Acceso a
                </span>
                {empresas.map((e) => (
                  <ToggleEmpresa key={e.id} usuario={u} empresa={e} />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted">
                Administrador · ve las dos empresas siempre
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
