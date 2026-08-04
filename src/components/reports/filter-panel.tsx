"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { IconFiltros } from "@/components/nav-icons";

/**
 * Un filtro con varias opciones excluyentes (empresa, empleado, servicio,
 * etiqueta). Se dibuja como lista desplegable y no como una fila de botones:
 * con veinte empleados, una fila de botones ocupa media pantalla antes de
 * mostrar el primer reporte.
 */
type CampoSelect = {
  tipo: "select";
  name: string;
  label: string;
  /** Valor aplicado ahora mismo; cadena vacía significa "sin filtrar". */
  valor: string;
  /** Texto de la opción que no filtra nada ("Todos", "Todas"). */
  vacio: string;
  opciones: { value: string; label: string }[];
};

/** Un filtro que se activa o no (los pendientes: sin documento, sin firma). */
type CampoCheckbox = {
  tipo: "checkbox";
  name: string;
  label: string;
  activo: boolean;
};

export type CampoFiltro = CampoSelect | CampoCheckbox;

function estaActivo(campo: CampoFiltro): boolean {
  return campo.tipo === "select" ? campo.valor !== "" : campo.activo;
}

/** Texto que resume un filtro aplicado, para la fila de fichas. */
function resumen(campo: CampoFiltro): string {
  if (campo.tipo === "checkbox") return campo.label;
  const opcion = campo.opciones.find((o) => o.value === campo.valor);
  return opcion ? `${campo.label}: ${opcion.label}` : campo.label;
}

function construirUrl(
  basePath: string,
  q: string | undefined,
  valores: { name: string; value: string }[],
): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  for (const { name, value } of valores) {
    if (value) sp.set(name, value);
  }
  const query = sp.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Botón de filtros y su panel.
 *
 * Todos los filtros viven detrás de un botón en vez de estar desplegados en la
 * página. Desplegados, la lista de empleados y las etiquetas empujaban los
 * reportes fuera de la primera pantalla — y la mayoría de las veces se entra a
 * mirar los reportes, no a filtrarlos.
 *
 * Al aplicar se navega a una URL con los filtros como parámetros, no se filtra
 * en el navegador: la dirección resultante se puede compartir o guardar, el
 * botón "atrás" funciona, y el filtrado real ocurre en SQL.
 */
export function FilterPanel({
  basePath,
  q,
  campos,
}: {
  basePath: string;
  q?: string;
  campos: CampoFiltro[];
}) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  const t = useTranslations("filterPanel");

  const activos = campos.filter(estaActivo);

  // Remonta el formulario cuando cambian los filtros aplicados: los campos son
  // no controlados, y sin esto conservarían en el DOM lo que el usuario había
  // tecleado antes de navegar.
  const clave = campos
    .map((c) => (c.tipo === "select" ? c.valor : String(c.activo)))
    .join("|");

  function aplicar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const valores = campos.map((campo) => ({
      name: campo.name,
      value: String(datos.get(campo.name) ?? ""),
    }));
    setAbierto(false);
    router.push(construirUrl(basePath, q, valores));
  }

  /** URL igual a la actual pero sin un filtro concreto. */
  function urlSin(name: string): string {
    return construirUrl(
      basePath,
      q,
      campos.map((campo) => ({
        name: campo.name,
        value:
          campo.name === name
            ? ""
            : campo.tipo === "select"
              ? campo.valor
              : campo.activo
                ? "1"
                : "",
      })),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-surface-muted hover:text-text"
        >
          <IconFiltros className="h-4 w-4" />
          {t("boton")}
          {activos.length > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-white">
              {activos.length}
            </span>
          ) : null}
        </button>

        {abierto ? (
          <>
            {/* Capa invisible: un clic fuera cierra el panel, sin escuchar
                eventos en todo el documento. */}
            <button
              type="button"
              aria-label={t("cerrar")}
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setAbierto(false)}
            />

            <form
              key={clave}
              onSubmit={aplicar}
              className="absolute left-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-4 rounded-xl border border-border bg-surface p-4 shadow-lg"
            >
              {campos.map((campo) =>
                campo.tipo === "select" ? (
                  <div key={campo.name} className="space-y-1.5">
                    <label
                      htmlFor={`filtro-${campo.name}`}
                      className="block text-xs font-medium uppercase tracking-wide text-muted"
                    >
                      {campo.label}
                    </label>
                    <select
                      id={`filtro-${campo.name}`}
                      name={campo.name}
                      defaultValue={campo.valor}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none"
                    >
                      <option value="">{campo.vacio}</option>
                      {campo.opciones.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null,
              )}

              {campos.some((c) => c.tipo === "checkbox") ? (
                <fieldset className="space-y-2">
                  <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                    {t("pendientes")}
                  </legend>
                  {campos.map((campo) =>
                    campo.tipo === "checkbox" ? (
                      <label
                        key={campo.name}
                        className="flex items-center gap-2.5 text-sm text-text"
                      >
                        <input
                          type="checkbox"
                          name={campo.name}
                          value="1"
                          defaultChecked={campo.activo}
                          className="h-4 w-4 rounded border-border accent-brand"
                        />
                        {campo.label}
                      </label>
                    ) : null,
                  )}
                </fieldset>
              ) : null}

              <div className="flex items-center gap-2 border-t border-border pt-3">
                <button
                  type="submit"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong"
                >
                  {t("aplicar")}
                </button>
                {activos.length > 0 ? (
                  // Enlace y no botón de reinicio: "limpiar" tiene que navegar
                  // a la lista sin filtros, no solo vaciar el formulario.
                  <Link
                    href={construirUrl(
                      basePath,
                      q,
                      campos.map((c) => ({ name: c.name, value: "" })),
                    )}
                    onClick={() => setAbierto(false)}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:text-text"
                  >
                    {t("limpiar")}
                  </Link>
                ) : null}
              </div>
            </form>
          </>
        ) : null}
      </div>

      {/* Fichas de lo aplicado: sin esto habría que abrir el panel para saber
          por qué la lista muestra tres reportes en vez de cuarenta. */}
      {activos.map((campo) => (
        <Link
          key={campo.name}
          href={urlSin(campo.name)}
          className="flex items-center gap-1.5 rounded-full border border-brand bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand transition hover:brightness-95"
        >
          {resumen(campo)}
          <span aria-hidden>×</span>
          <span className="sr-only">{t("quitarFiltro")}</span>
        </Link>
      ))}
    </div>
  );
}
