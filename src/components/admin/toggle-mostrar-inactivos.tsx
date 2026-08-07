import Link from "next/link";

/**
 * "Mostrar clientes inactivos" / "Mostrar usuarios desactivados": una
 * casilla que en realidad es un enlace a la misma pantalla con o sin el
 * parámetro en la URL. Sin JavaScript propio y sin convertir la página en un
 * Client Component — el filtrado real ocurre en SQL, no en el navegador,
 * mismo patrón que ya usan `SelectorVista` y `Paginacion`.
 */
export function ToggleMostrarInactivos({
  href,
  activo,
  etiqueta,
}: {
  href: string;
  activo: boolean;
  etiqueta: string;
}) {
  return (
    <Link
      href={href}
      aria-pressed={activo}
      className="inline-flex items-center gap-2 text-sm text-text"
    >
      <span
        aria-hidden
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
          activo
            ? "border-brand bg-brand text-white"
            : "border-border bg-surface"
        }`}
      >
        {activo ? "✓" : ""}
      </span>
      {etiqueta}
    </Link>
  );
}
