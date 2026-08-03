"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  IconAnaliticas,
  IconNuevo,
  IconPanel,
  IconReportes,
  IconSalir,
  IconUsuarios,
} from "@/components/nav-icons";
import { Logotipo } from "@/components/logotipo";
import type { CurrentUser } from "@/lib/auth-guard";

export type NavItem = {
  href: string;
  label: string;
  icono: "panel" | "reportes" | "nuevo" | "usuarios" | "analiticas";
  /** Si viene, el elemento despliega estas opciones en vez de navegar. */
  hijos?: { href: string; label: string }[];
};

const ICONOS = {
  panel: IconPanel,
  reportes: IconReportes,
  nuevo: IconNuevo,
  usuarios: IconUsuarios,
  analiticas: IconAnaliticas,
} as const;

/**
 * Elemento del rail que despliega opciones en vez de navegar.
 *
 * Arranca abierto si ya se está dentro de una de sus opciones: al entrar a las
 * analíticas de SaaS, el menú tiene que mostrar dónde estás, no obligarte a
 * desplegarlo otra vez para descubrirlo.
 */
function NavDesplegable({
  item,
  pathname,
  onNavegar,
}: {
  item: NavItem & { hijos: { href: string; label: string }[] };
  pathname: string;
  onNavegar: () => void;
}) {
  const dentro = item.hijos.some((h) => pathname === h.href);
  const [abierto, setAbierto] = useState(dentro);
  const Icono = ICONOS[item.icono];

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
          dentro
            ? "text-text"
            : "text-muted hover:bg-surface-muted hover:text-text"
        }`}
      >
        <Icono />
        <span className="flex-1 text-left">{item.label}</span>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          fill="currentColor"
          className={`h-3 w-3 transition ${abierto ? "" : "-rotate-90"}`}
        >
          <path d="M6 8.5 1.5 4h9L6 8.5Z" />
        </svg>
      </button>

      {abierto ? (
        // Sangría a la altura del texto del padre, no del ícono: así se lee
        // como una lista dependiente y no como otro nivel suelto.
        <ul className="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-4">
          {item.hijos.map((h) => {
            const activo = pathname === h.href;
            return (
              <li key={h.href}>
                <Link
                  href={h.href}
                  onClick={onNavegar}
                  aria-current={activo ? "page" : undefined}
                  className={`block rounded-lg px-2.5 py-1.5 text-sm transition ${
                    activo
                      ? "bg-brand-soft font-medium text-brand"
                      : "text-muted hover:bg-surface-muted hover:text-text"
                  }`}
                >
                  {h.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}


/**
 * Menú de la cuenta, abajo del todo.
 *
 * Se abre hacia arriba porque vive pegado al borde inferior: desplegado hacia
 * abajo quedaría fuera de la pantalla. Cerrar sesión está aquí y no suelto en
 * la barra para que no se pulse por error al buscar otra cosa — es la acción
 * que más molesta equivocarse, porque obliga a volver a escribir la contraseña.
 */
function MenuCuenta({
  user,
  onCerrarSesion,
}: {
  user: CurrentUser;
  onCerrarSesion: () => void | Promise<void>;
}) {
  const t = useTranslations("nav");
  const [abierto, setAbierto] = useState(false);
  const inicial = user.fullName.trim().charAt(0).toUpperCase();
  const rol = user.role === "admin" ? t("administrador") : t("empleado");

  return (
    <div className="relative">
      {abierto ? (
        <>
          <button
            type="button"
            aria-label={t("cerrarMenu")}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setAbierto(false)}
          />

          <div className="absolute bottom-full left-0 z-20 mb-2 w-[calc(100%+0.5rem)] min-w-52 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
            <div className="border-b border-border px-3 py-2">
              <p className="truncate text-sm font-medium text-text">
                {user.fullName}
              </p>
              <p className="text-xs text-muted">{rol}</p>
            </div>

            <form action={onCerrarSesion}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-text transition hover:bg-surface-muted"
              >
                <IconSalir className="h-4 w-4 text-muted" />
                {t("cerrarSesion")}
              </button>
            </form>
          </div>
        </>
      ) : null}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-surface-muted"
      >
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
        >
          {inicial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight text-text">
            {user.fullName}
          </span>
          <span className="block text-xs leading-tight text-muted">{rol}</span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          fill="currentColor"
          className={`h-3 w-3 shrink-0 text-muted transition ${abierto ? "" : "rotate-180"}`}
        >
          <path d="M6 8.5 1.5 4h9L6 8.5Z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Rail lateral de navegación.
 *
 * En pantallas anchas es una columna fija a la izquierda. En el celular esa
 * columna no cabe sin comerse el contenido, así que se convierte en un cajón
 * que se abre desde el botón de la barra superior — los trabajadores crean
 * reportes desde el teléfono, no es un caso secundario.
 *
 * Abrir y cerrar se controla desde fuera porque el botón que lo abre vive en
 * la barra superior, que es otro componente: el estado tiene que ser de quien
 * los contiene a los dos.
 */
export function SideNav({
  user,
  nav,
  onCerrarSesion,
  abierto,
  onCerrar,
  children,
}: {
  user: CurrentUser;
  nav: NavItem[];
  onCerrarSesion: () => void | Promise<void>;
  abierto: boolean;
  onCerrar: () => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const inicio = user.role === "admin" ? "/admin" : "/reportes";

  return (
    <>
      {abierto ? (
        <button
          type="button"
          aria-label={t("cerrarMenu")}
          onClick={onCerrar}
          className="fixed inset-0 z-40 cursor-default bg-black/50 md:hidden"
        />
      ) : null}

      {/* En escritorio queda pegado arriba y ocupa el alto de la pantalla: con
          `static` se iba desplazando con la lista y la navegación desaparecía
          al bajar. La nav de adentro scrollea sola si no cabe, y el menú de
          cuenta se queda anclado abajo. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-transform md:sticky md:bottom-auto md:top-0 md:h-screen md:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* El lockup completo ocupa el ancho del rail. Sin la palabra
            "Reportes" al lado: el logotipo ya trae su propio subtítulo, y dos
            rótulos pegados se estorban. */}
        <div className="px-4 py-4">
          <Link href={inicio} className="block">
            <Logotipo alto={68} className="w-full" />
          </Link>
        </div>

        {/* El selector de empresa va arriba y siempre visible: determina todo
            lo que se ve después, esconderlo en un menú invita a registrar un
            trabajo en la empresa equivocada. */}
        {children ? <div className="px-3 pb-3">{children}</div> : null}

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {nav.map((item) => {
            if (item.hijos) {
              return (
                <NavDesplegable
                  key={item.href}
                  item={{ ...item, hijos: item.hijos }}
                  pathname={pathname}
                  onNavegar={onCerrar}
                />
              );
            }

            const Icono = ICONOS[item.icono];
            // Coincidencia exacta: /admin es prefijo de /admin/reportes, y con
            // startsWith los dos quedarían marcados como activos a la vez.
            const activo = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                // En el celular el rail es un cajón encima del contenido: si no
                // se cierra al elegir, tapa la página que se acaba de abrir.
                onClick={onCerrar}
                aria-current={activo ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                  activo
                    ? "bg-brand-soft text-brand"
                    : "text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                <Icono />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-2">
          <MenuCuenta user={user} onCerrarSesion={onCerrarSesion} />
        </div>
      </aside>
    </>
  );
}
