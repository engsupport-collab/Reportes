import Link from "next/link";

/**
 * Chip de filtro, como enlace.
 *
 * Cada filtro del sistema (empresa, empleado, tipo de servicio, etiqueta,
 * faltantes) usa esta misma pieza, para que cambiar de filtro se sienta igual
 * en cualquier pantalla. Es un enlace y no un botón con JavaScript: la URL
 * resultante se puede compartir, guardar en favoritos, y el botón "atrás" del
 * navegador funciona como se espera.
 */
export function FilterChip({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        activo
          ? "border-brand bg-brand-soft text-brand"
          : "border-border text-muted hover:bg-surface-muted hover:text-text"
      }`}
    >
      {children}
    </Link>
  );
}

export function FilterGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}
