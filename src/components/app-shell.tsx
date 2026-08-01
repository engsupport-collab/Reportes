import Link from "next/link";

import { logoutAction } from "@/actions/auth";
import { elegirEmpresaAction } from "@/actions/companies";
import type { CurrentUser } from "@/lib/auth-guard";
import { formatFechaEncabezado, horaLocal } from "@/lib/fechas";
import { CompanySwitcher } from "./company-switcher";

function saludo(): string {
  // horaLocal() y no getHours(): este componente se renderiza en el servidor,
  // que en Vercel corre en UTC. Sin la conversión, el saludo diría "buenas
  // noches" a las tres de la tarde en Colombia.
  const hora = horaLocal();
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

type NavItem = { href: string; label: string };

function navPara(role: CurrentUser["role"]): NavItem[] {
  if (role === "admin") {
    return [
      { href: "/admin", label: "Panel" },
      { href: "/admin/reportes", label: "Reportes" },
      { href: "/reportes/nuevo", label: "Nuevo reporte" },
      { href: "/admin/usuarios", label: "Usuarios" },
    ];
  }
  return [
    { href: "/reportes", label: "Mis reportes" },
    { href: "/reportes/nuevo", label: "Nuevo reporte" },
  ];
}

/**
 * Marco común de las dos vistas.
 *
 * Recibe el usuario ya resuelto en vez de consultarlo por su cuenta: la página
 * que lo usa tiene que haber llamado antes a requireUser() o requireAdmin(),
 * así la comprobación de acceso ocurre siempre antes de renderizar nada.
 */
export function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const nav = navPara(user.role);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href={user.role === "admin" ? "/admin" : "/reportes"}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
              GR
            </span>
          </Link>

          {/* El admin no elige empresa a nivel de sesión — ve las dos siempre
              y filtra dentro de cada página. El cambiador solo aplica al
              empleado, que sí trabaja "dentro de" una empresa a la vez. */}
          {user.empresaActiva ? (
            <CompanySwitcher
              empresas={user.empresas}
              activa={user.empresaActiva}
              onCambiar={elegirEmpresaAction}
            />
          ) : null}

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-text">
                {user.fullName}
              </p>
              <p className="text-xs leading-tight text-muted">
                {user.role === "admin" ? "Administrador" : "Empleado"}
              </p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {saludo()}, {user.fullName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm capitalize text-muted">
            {formatFechaEncabezado()}
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}
