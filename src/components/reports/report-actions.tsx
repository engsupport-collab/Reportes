"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import type { FinalizarState } from "@/actions/reports";
import type { ReportStatus } from "@/lib/roles";

/**
 * Cierre de un reporte de servicio: lo marca terminado y se lo manda al
 * cliente. Es el único botón del sistema que envía algo hacia afuera.
 *
 * No pregunta a dónde mandarlo: usa el correo que el cliente escribió al
 * firmar. Pedirlo otra vez sería teclear dos veces el mismo dato, con el
 * riesgo de que las dos copias no coincidan y el reporte acabe en una
 * dirección que el cliente no puso.
 */
export function FinalizarReporte({
  action,
  sinAdjuntos,
}: {
  /**
   * No recibe ni estado previo ni FormData: no hay ningún campo que enviar,
   * todo lo que necesita ya está en el reporte.
   */
  action: () => Promise<FinalizarState>;
  sinAdjuntos: boolean;
}) {
  const t = useTranslations("reportActions");
  const [state, formAction, pendiente] = useActionState<FinalizarState, FormData>(
    () => action(),
    {},
  );

  return (
    <form action={formAction} className="min-w-64 flex-1 space-y-3">
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendiente}
        onClick={(e) => {
          // Se avisa, pero no se bloquea: a veces el documento llega después
          // del trabajo, y obligar a subirlo antes empujaría a no cerrar nunca
          // el reporte. El faltante queda señalado hasta que se suba.
          if (sinAdjuntos && !window.confirm(t("confirmTerminado"))) {
            e.preventDefault();
          }
        }}
        className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendiente ? t("enviando") : t("marcarTerminado")}
      </button>
    </form>
  );
}

function BotonEstado({
  status,
  sinAdjuntos,
}: {
  status: ReportStatus;
  sinAdjuntos: boolean;
}) {
  const { pending } = useFormStatus();
  const marcandoTerminado = status === "en_proceso";
  const t = useTranslations("reportActions");

  return (
    <button
      type="submit"
      disabled={pending}
      // Se avisa, pero no se bloquea: a veces el documento llega después del
      // trabajo, y obligar a subirlo antes empujaría a no marcar nunca el
      // reporte como terminado. El faltante queda señalado hasta que se suba.
      onClick={(e) => {
        if (marcandoTerminado && sinAdjuntos) {
          const seguir = window.confirm(t("confirmTerminado"));
          if (!seguir) e.preventDefault();
        }
      }}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        marcandoTerminado
          ? "bg-brand text-white hover:bg-brand-strong"
          : "border border-border text-muted hover:bg-surface-muted hover:text-text"
      }`}
    >
      {pending
        ? t("guardando")
        : marcandoTerminado
          ? t("marcarTerminado")
          : t("volverEnProceso")}
    </button>
  );
}

export function EstadoToggle({
  action,
  status,
  sinAdjuntos,
}: {
  action: (formData: FormData) => void;
  status: ReportStatus;
  sinAdjuntos: boolean;
}) {
  return (
    <form action={action}>
      <input
        type="hidden"
        name="estado"
        value={status === "en_proceso" ? "terminado" : "en_proceso"}
      />
      <BotonEstado status={status} sinAdjuntos={sinAdjuntos} />
    </form>
  );
}

function BotonEliminar() {
  const { pending } = useFormStatus();
  const t = useTranslations("reportActions");

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        const seguir = window.confirm(t("confirmEliminar"));
        if (!seguir) e.preventDefault();
      }}
      className="rounded-lg border border-danger/40 px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? t("eliminando") : t("eliminar")}
    </button>
  );
}

export function EliminarReporte({ action }: { action: () => void }) {
  return (
    <form action={action}>
      <BotonEliminar />
    </form>
  );
}
