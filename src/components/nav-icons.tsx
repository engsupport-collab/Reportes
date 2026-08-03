/**
 * Íconos de la navegación, en línea.
 *
 * El proyecto no tiene librería de íconos y no vale la pena agregar una por
 * seis dibujos: cada una trae cientos de kilobytes para usar una fracción.
 * Todos comparten el mismo trazo y la misma caja de 24 para que se vean como
 * un conjunto y no como recortes de sitios distintos.
 */

type IconProps = { className?: string };

function Svg({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-[18px] w-[18px]"}
    >
      {children}
    </svg>
  );
}

export function IconPanel(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Svg>
  );
}

export function IconReportes(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </Svg>
  );
}

export function IconNuevo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  );
}

export function IconUsuarios(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3.25 3.25 0 0 1 0 5.9" />
      <path d="M17.5 14.5a5.5 5.5 0 0 1 3 5.5" />
    </Svg>
  );
}

export function IconFiltros(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 5h18M6 12h12M10 19h4" />
    </Svg>
  );
}

export function IconAnaliticas(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 17v-5M13 17V8M18 17v-7" />
    </Svg>
  );
}

export function IconBuscar(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function IconPerfil(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  );
}

export function IconIdioma(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 3.75 5.75 3.75 9S14.5 18.5 12 21c-2.5-2.5-3.75-5.75-3.75-9S9.5 5.5 12 3Z" />
    </Svg>
  );
}

export function IconSalir(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 17v1.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2V7" />
      <path d="M10 12h11M18 9l3 3-3 3" />
    </Svg>
  );
}
