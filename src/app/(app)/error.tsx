"use client";

import { PantallaDeError } from "@/components/pantalla-de-error";

/**
 * Frontera de errores de la aplicación autenticada.
 *
 * Va en `(app)` y no solo en la raíz para que el marco —la barra y el menú,
 * que viven en el layout de este grupo— siga en pie: se cae la pantalla, no
 * la aplicación, y quien está en campo puede seguir navegando.
 */
export default function ErrorDeLaAplicacion({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <PantallaDeError error={error} alReintentar={unstable_retry} />;
}
