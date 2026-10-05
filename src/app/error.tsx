"use client";

import { PantallaDeError } from "@/components/pantalla-de-error";

/**
 * Frontera de errores de lo que queda fuera del grupo `(app)`: el ingreso y
 * la selección de empresa. Ahí no hay marco que conservar, así que ocupa la
 * pantalla entera.
 */
export default function ErrorFueraDeLaAplicacion({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <PantallaDeError error={error} alReintentar={unstable_retry} pantallaCompleta />;
}
