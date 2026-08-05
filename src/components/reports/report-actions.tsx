"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import type { FinalizarState } from "@/actions/reports";
import type { ReportStatus } from "@/lib/roles";

const CAMPO =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none";

/**
 * Cierre de un reporte de servicio: lo marca terminado y se lo manda al
 * cliente. Es el único botón del sistema que envía algo hacia afuera.
 *
 * Si el correo del cliente ya quedó registrado al firmar, el botón hace todo
 * de una. Si no —un reporte que se cierra sin firma— el primer clic abre el
 * campo para pedirlo, y el segundo confirma. Se pide aquí y no antes porque
 * es el único momento en que hace falta.
 */
export function FinalizarReporte({
  action,
  correoRegistrado,
  sinAdjuntos,
}: {
  action: (estado: FinalizarState, formData: FormData) => Promise<FinalizarState>;
  /** El correo capturado al firmar, si lo hay. */
  correoRegistrado: string | null;
  sinAdjuntos: boolean;
}) {
  const t = useTranslations("reportActions");
  const [state, formAction, pendiente] = useActionState<FinalizarState, FormData>(
    action,
    {},
  );
  const [pidiendoCorreo, setPidiendoCorreo] = useState(false);

  // Un primer clic que solo abre el campo no debe enviar el formulario: por eso
  // el botón cambia de tipo según lo que le toque hacer en ese momento.
  const soloAbrirCampo = !correoRegistrado && !pidiendoCorreo;

  return (
    <form action={formAction} className="min-w-64 flex-1 space-y-3">
      {pidiendoCorreo ? (
        <div className="space-y-1.5 rounded-xl border border-dashed border-border p-4">
          <label
            htmlFor="correoCliente"
            className="block text-sm font-medium text-text"
          >
            {t("correoCliente")}
          </label>
          <input
            id="correoCliente"
            name="correoCliente"
            type="email"
            required
            autoFocus
            maxLength={200}
            className={CAMPO}
            placeholder={t("placeholderCorreoCliente")}
          />
          <p className="text-xs text-muted">{t("correoClienteAyuda")}</p>
        </div>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type={soloAbrirCampo ? "button" : "submit"}
          disabled={pendiente}
          onClick={(e) => {
            if (soloAbrirCampo) {
              setPidiendoCorreo(true);
              return;
            }
            // Se avisa, pero no se bloquea: a veces el documento llega después
            // del trabajo, y obligar a subirlo antes empujaría a no cerrar
            // nunca el reporte. El faltante queda señalado hasta que se suba.
            if (sinAdjuntos && !window.confirm(t("confirmTerminado"))) {
              e.preventDefault();
            }
          }}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendiente
            ? t("enviando")
            : pidiendoCorreo
              ? t("enviarYTerminar")
              : t("marcarTerminado")}
        </button>

        {pidiendoCorreo ? (
          <button
            type="button"
            onClick={() => setPidiendoCorreo(false)}
            className="text-sm font-medium text-muted transition hover:text-text"
          >
            {t("cancelar")}
          </button>
        ) : null}
      </div>
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
