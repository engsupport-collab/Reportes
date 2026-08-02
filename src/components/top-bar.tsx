"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { IconBuscar, IconMenu } from "@/components/nav-icons";
import type { CurrentUser } from "@/lib/auth-guard";

/**
 * Barra superior: buscador a la izquierda, cuenta a la derecha.
 *
 * El buscador es uno solo para todo el sistema y vive aquí, no dentro de cada
 * lista: buscar un reporte es lo que más se hace, y tenerlo que ir a encontrar
 * primero en la página correcta sobra.
 */
export function TopBar({
  user,
  onAbrirMenu,
}: {
  user: CurrentUser;
  onAbrirMenu: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const destino = user.role === "admin" ? "/admin/reportes" : "/reportes";
  const inicial = user.fullName.trim().charAt(0).toUpperCase();

  function buscar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();

    const sp = new URLSearchParams();

    // Si ya se está en la lista, buscar no debe tirar los filtros puestos: se
    // conservan todos menos la página, que vuelve a la primera porque el
    // resultado nuevo casi nunca tiene tantas.
    if (pathname === destino) {
      for (const [clave, valor] of searchParams.entries()) {
        if (clave !== "q" && clave !== "pagina") sp.set(clave, valor);
      }
    }

    if (q) sp.set("q", q);

    const query = sp.toString();
    router.push(query ? `${destino}?${query}` : destino);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menú"
          className="rounded-lg p-1.5 text-muted transition hover:bg-surface-muted hover:text-text md:hidden"
        >
          <IconMenu className="h-5 w-5" />
        </button>

        <form onSubmit={buscar} className="relative min-w-0 flex-1 sm:max-w-md">
          <IconBuscar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="q"
            // key: al navegar a otra búsqueda el campo tiene que reflejar la
            // vigente, no conservar en el DOM lo que se tecleó antes.
            key={searchParams.get("q") ?? ""}
            defaultValue={
              pathname === destino ? (searchParams.get("q") ?? "") : ""
            }
            placeholder="Buscar por proyecto, cliente u orden…"
            aria-label="Buscar reportes"
            className="w-full rounded-lg border border-border bg-surface-muted py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
        </form>

        <Link
          href="/perfil"
          className="ml-auto flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-surface-muted"
        >
          <span className="hidden text-right sm:block">
            <span className="block text-sm font-medium leading-tight text-text">
              {user.fullName}
            </span>
            <span className="block text-xs leading-tight text-muted">
              {user.role === "admin" ? "Administrador" : "Empleado"}
            </span>
          </span>
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
          >
            {inicial}
          </span>
          <span className="sr-only">Ver mi perfil</span>
        </Link>
      </div>
    </header>
  );
}
