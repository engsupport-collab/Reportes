"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { IconBuscar, IconMenu } from "@/components/nav-icons";
import { IdiomaSelector } from "@/components/idioma-selector";
import type { NavItem } from "@/components/side-nav";
import type { CurrentUser } from "@/lib/auth-guard";

/**
 * Para comparar lo escrito con el nombre de una sección sin que estorben las
 * mayúsculas ni las tildes: quien escribe "nue" o "electrico" con prisa espera
 * encontrar "Nuevo reporte" y "Eléctrico" igual.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

type Destino = { href: string; label: string };

/**
 * Buscador de la barra superior.
 *
 * Hace dos cosas con el mismo campo: sugiere secciones a las que ir (escribir
 * "pan" ofrece "Panel") y, al confirmar, busca reportes. Las secciones son
 * cuatro o cinco y se sabe su nombre; los reportes son miles y no. Por eso la
 * sugerencia hay que elegirla — con Enter a secas se busca, que es lo que se
 * hace la mayoría de las veces.
 */
function Buscador({
  valorInicial,
  destinos,
  onBuscar,
}: {
  valorInicial: string;
  destinos: Destino[];
  onBuscar: (q: string) => void;
}) {
  const t = useTranslations("buscador");
  const router = useRouter();
  const [texto, setTexto] = useState(valorInicial);
  const [abierto, setAbierto] = useState(false);
  // -1 = ninguna sugerencia elegida, así Enter busca en vez de navegar.
  const [indice, setIndice] = useState(-1);

  const consulta = normalizar(texto.trim());
  const sugerencias = consulta
    ? destinos.filter((d) => normalizar(d.label).includes(consulta))
    : [];
  const visibles = abierto && sugerencias.length > 0;

  function irA(destino: Destino) {
    setAbierto(false);
    setTexto("");
    router.push(destino.href);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!visibles) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => (i + 1) % sugerencias.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => (i <= 0 ? sugerencias.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setAbierto(false);
      setIndice(-1);
    }
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const elegida = sugerencias[indice];
    if (visibles && elegida) {
      irA(elegida);
      return;
    }
    setAbierto(false);
    onBuscar(texto.trim());
  }

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-md">
      <form onSubmit={enviar} role="search">
        <IconBuscar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          name="q"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
            setIndice(-1);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclear}
          placeholder={t("placeholder")}
          aria-label={t("ariaLabel")}
          role="combobox"
          aria-expanded={visibles}
          aria-controls="sugerencias-busqueda"
          aria-autocomplete="list"
          autoComplete="off"
          className="w-full rounded-lg border border-border bg-surface-muted py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
        />
      </form>

      {visibles ? (
        <>
          {/* Capa invisible: un clic fuera cierra la lista sin escuchar
              eventos en todo el documento. No se usa onBlur porque se dispara
              antes del clic en una sugerencia y se la lleva por delante. */}
          <button
            type="button"
            aria-label={t("cerrarSugerencias")}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setAbierto(false)}
          />

          <ul
            id="sugerencias-busqueda"
            role="listbox"
            className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
          >
            <li className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              {t("irA")}
            </li>
            {sugerencias.map((d, i) => (
              <li key={d.href} role="option" aria-selected={i === indice}>
                <button
                  type="button"
                  onClick={() => irA(d)}
                  onMouseEnter={() => setIndice(i)}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm transition ${
                    i === indice
                      ? "bg-brand-soft text-brand"
                      : "text-text hover:bg-surface-muted"
                  }`}
                >
                  {d.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/**
 * Barra superior: buscador a la izquierda, cuenta a la derecha.
 *
 * El buscador es uno solo para todo el sistema y vive aquí, no dentro de cada
 * lista: buscar un reporte es lo que más se hace, y tenerlo que ir a encontrar
 * primero en la página correcta sobra.
 */
export function TopBar({
  user,
  nav,
  onAbrirMenu,
}: {
  user: CurrentUser;
  nav: NavItem[];
  onAbrirMenu: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const destino = user.role === "admin" ? "/admin/reportes" : "/reportes";
  const inicial = user.fullName.trim().charAt(0).toUpperCase();
  const qActual = pathname === destino ? (searchParams.get("q") ?? "") : "";

  const destinos: Destino[] = [
    ...nav.map((n) => ({ href: n.href, label: n.label })),
    { href: "/perfil", label: t("nav.miPerfil") },
  ];

  function buscar(q: string) {
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
          aria-label={t("nav.abrirMenu")}
          className="rounded-lg p-1.5 text-muted transition hover:bg-surface-muted hover:text-text md:hidden"
        >
          <IconMenu className="h-5 w-5" />
        </button>

        {/* key: al navegar a otra búsqueda el campo tiene que reflejar la
            vigente, no conservar lo que se tecleó antes. */}
        <Buscador
          key={qActual}
          valorInicial={qActual}
          destinos={destinos}
          onBuscar={buscar}
        />

        {/* El selector va junto a la cuenta, no dentro del menú de la cuenta:
            es una preferencia de dispositivo, no una acción sobre la sesión, y
            tiene que verse sin necesidad de desplegar nada. */}
        <div className="ml-auto flex items-center gap-1">
          <IdiomaSelector />

          <Link
            href="/perfil"
            className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-surface-muted"
          >
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-medium leading-tight text-text">
                {user.fullName}
              </span>
              <span className="block text-xs leading-tight text-muted">
                {user.role === "admin" ? t("nav.administrador") : t("nav.empleado")}
              </span>
            </span>
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
            >
              {inicial}
            </span>
            <span className="sr-only">{t("buscador.verMiPerfil")}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
