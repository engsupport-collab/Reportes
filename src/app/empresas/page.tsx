import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { logoutAction } from "@/actions/auth";
import { elegirEmpresaAction } from "@/actions/companies";
import { requireUser } from "@/lib/auth-guard";
import { rutaInicio } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Elegir empresa · Gestor de Reportes",
};

/**
 * Selector de empresa, justo después de iniciar sesión.
 *
 * Quien solo tiene acceso a una empresa nunca ve esta pantalla: se le asigna
 * sola. Obligar a elegir cuando no hay nada que elegir es un clic diario sin
 * ningún propósito.
 */
export default async function EmpresasPage() {
  const user = await requireUser();

  // El admin no elige empresa — si llega aquí por una URL escrita a mano, se
  // lo manda directo a su panel en vez de mostrarle un selector que no aplica.
  if (user.role === "admin") {
    redirect(rutaInicio(user.role));
  }

  if (user.empresas.length === 1) {
    await elegirEmpresaAction(user.empresas[0]!.id);
  }

  if (user.empresaActiva) {
    redirect(rutaInicio(user.role));
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-text">
            Hola, {user.fullName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted">
            ¿Con cuál empresa vas a trabajar?
          </p>
        </div>

        <ul className="space-y-3">
          {user.empresas.map((empresa) => (
            <li key={empresa.id}>
              <form action={elegirEmpresaAction.bind(null, empresa.id)}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-4 rounded-2xl border border-border bg-surface p-5 text-left transition hover:border-brand hover:shadow-sm"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-sm font-bold uppercase text-brand">
                    {empresa.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">
                      {empresa.name}
                    </span>
                    <span className="block text-xs text-muted">
                      Ver reportes de {empresa.name}
                    </span>
                  </span>
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>

        <form action={logoutAction} className="mt-6 text-center">
          <button
            type="submit"
            className="text-sm font-medium text-muted transition hover:text-text"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
