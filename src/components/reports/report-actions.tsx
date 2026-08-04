"use client";

import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import type { ReportStatus } from "@/lib/roles";

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
