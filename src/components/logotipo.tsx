/* eslint-disable @next/next/no-img-element -- son ficheros estáticos de
   public/, con tamaño fijo y conocido; el optimizador de Next no aporta nada
   aquí y obligaría a pasar por su ruta de imágenes para un logo de 76 KB. */

/**
 * Marca del sistema.
 *
 * Vive en un solo componente a propósito: el logotipo aparece en el rail, en
 * el ingreso y (pronto) en el PDF, y repartir el dibujo por las pantallas
 * obligaría a acordarse de todas cuando cambie.
 *
 * Hay dos variantes de color porque el logotipo es de un solo tono: la azul
 * desaparecería sobre el fondo casi negro del modo oscuro, y la blanca sobre
 * el papel. Las dos salen del mismo archivo original mediante
 * `scripts/generar-logos.ts`, así que no pueden desincronizarse entre sí.
 *
 * Se muestran las dos y se oculta una con CSS, en vez de elegir en
 * JavaScript: el modo de color se resuelve al pintar, y decidirlo en el
 * cliente haría que el logo parpadeara al cargar.
 */

type Props = {
  /** `completo` = monograma y texto. `monograma` = solo la S. */
  variante?: "completo" | "monograma";
  /** Alto en píxeles. El ancho sale solo, manteniendo la proporción. */
  alto?: number;
  className?: string;
};

const RELACION = {
  // Proporciones reales de los archivos generados.
  completo: 1046 / 319,
  monograma: 229 / 319,
} as const;

export function Logotipo({
  variante = "completo",
  alto = 36,
  className = "",
}: Props) {
  const base = variante === "completo" ? "logo" : "monograma";
  const ancho = Math.round(alto * RELACION[variante]);
  const comun = "block w-auto";

  return (
    <span
      className={`inline-block shrink-0 ${className}`}
      style={{ height: alto, width: ancho }}
    >
      <img
        src={`/${base}-azul.png`}
        alt="Eng-Support Corp."
        width={ancho}
        height={alto}
        className={`${comun} dark:hidden`}
        style={{ height: alto }}
      />
      <img
        src={`/${base}-claro.png`}
        alt=""
        aria-hidden
        width={ancho}
        height={alto}
        className={`${comun} hidden dark:block`}
        style={{ height: alto }}
      />
    </span>
  );
}
