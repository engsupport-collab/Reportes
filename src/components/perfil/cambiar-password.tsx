"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import type { PerfilState } from "@/actions/perfil";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";

function Campo({
  id,
  label,
  ayuda,
}: {
  id: string;
  label: string;
  ayuda?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        required
        autoComplete={id === "actual" ? "current-password" : "new-password"}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text focus:border-brand focus:outline-none"
      />
      {ayuda ? <p className="text-xs text-muted">{ayuda}</p> : null}
    </div>
  );
}

/**
 * Cambio de la propia contraseña.
 *
 * El formulario se vacía al terminar bien porque React remonta los campos con
 * la `key`: dejar la contraseña nueva escrita en pantalla, en una tablet
 * compartida, es justo lo que no queremos.
 */
export function CambiarPassword({
  action,
}: {
  action: (
    estado: PerfilState,
    formData: FormData,
  ) => Promise<PerfilState>;
}) {
  const t = useTranslations("perfil");
  const [estado, formAction, pendiente] = useActionState(action, {});

  return (
    <form
      key={estado.ok ?? "form"}
      action={formAction}
      className="max-w-sm space-y-4"
    >
      <Campo id="actual" label={t("contrasenaActual")} />
      <Campo
        id="nueva"
        label={t("contrasenaNueva")}
        ayuda={t("ayudaMinimo", { min: PASSWORD_MIN_LENGTH })}
      />
      <Campo id="repetir" label={t("repetirNueva")} />

      {estado.error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {estado.error}
        </p>
      ) : null}

      {estado.ok ? (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success"
        >
          {estado.ok}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendiente ? t("guardando") : t("cambiarBoton")}
      </button>
    </form>
  );
}
