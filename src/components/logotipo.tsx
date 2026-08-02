/**
 * Marca del sistema.
 *
 * Está aislada en un solo componente a propósito: cuando llegue el logotipo
 * definitivo del cliente (en SVG), se sustituye aquí dentro y cambia en todos
 * los sitios a la vez — rail, ingreso, y donde se use después. Repartir el
 * dibujo por las pantallas obligaría a acordarse de todas.
 *
 * El SVG que venga tiene que heredar el color (`currentColor`) en vez de traer
 * el negro fijo: en modo oscuro el fondo es casi negro y un logo negro
 * desaparece. Meterlo dentro de un recuadro blanco no es solución, se ve como
 * una pegatina pegada encima.
 */
export function Logotipo({
  tamano = "normal",
}: {
  tamano?: "normal" | "grande";
}) {
  const caja = tamano === "grande" ? "h-12 w-12 text-lg" : "h-9 w-9 text-sm";

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl bg-brand font-bold text-white ${caja}`}
      aria-hidden
    >
      GR
    </span>
  );
}
