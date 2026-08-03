/* eslint-disable @next/next/no-img-element -- son ficheros estáticos de
   public/, con tamaño fijo y conocido; el optimizador de Next no aporta nada
   aquí y obligaría a pasar por su ruta de imágenes para un logo de 76 KB. */

/**
 * Marca del sistema.
 *
 * Vive en un solo componente a propósito: el logotipo aparece en el rail y en
 * el ingreso, y repartir el dibujo por las pantallas obligaría a acordarse de
 * todas cuando cambie.
 *
 * Se usa la versión clara porque la aplicación es solo oscura. La variante
 * azul sigue generándose (`scripts/generar-logos.ts`) para el membrete del PDF
 * y el favicon, que van sobre blanco.
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

  return (
    // `maxWidth: 100%` y no un ancho fijo: en una pantalla de 320px el lockup
    // a su tamaño natural se sale por la derecha y arrastra a toda la página
    // con scroll horizontal. Así encoge conservando la proporción.
    <span
      className={`inline-block max-w-full ${className}`}
      style={{ width: ancho }}
    >
      <img
        src={`/${base}-claro.png`}
        alt="Eng-Support Corp."
        width={ancho}
        height={alto}
        className="block h-auto w-auto"
      />
    </span>
  );
}
