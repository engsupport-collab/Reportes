"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { ReenviarState } from "@/actions/reports";
import type {
  CorreoFirmaState,
  FirmaState,
  IdiomaReporteState,
} from "@/actions/signature";
import { SelectorIdiomaDocumento } from "@/components/selector-idioma-documento";
import type { IdiomaDocumento } from "@/lib/idioma-documento";
import { SignaturePad } from "./signature-pad";

function BotonBorrarFirma({ onBorrar }: { onBorrar: () => void | Promise<void> }) {
  const [pendiente, startTransition] = useTransition();
  const t = useTranslations("firma");

  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        if (!window.confirm(t("confirmBorrar"))) {
          return;
        }
        startTransition(onBorrar);
      }}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-danger/40 hover:text-danger disabled:opacity-50"
    >
      {pendiente ? t("borrando") : t("volverAFirmar")}
    </button>
  );
}

/** Cómo terminó el último envío del reporte al cliente, si hubo alguno. */
export type UltimoEnvio = { salio: boolean; correo: string; fecha: string };

/**
 * En qué idioma sale el reporte, ya firmado: se cambia con un toque y queda
 * guardado, sin botón aparte.
 *
 * Está junto al correo porque las dos cosas son lo mismo: cómo se le entrega
 * el reporte al cliente. Y como el correo, se puede cambiar con el reporte
 * terminado — después se pulsa "Reenviar" y le llega en el idioma nuevo.
 */
function IdiomaDelEnvio({
  idioma,
  onCambiar,
}: {
  idioma: IdiomaDocumento;
  onCambiar: (idioma: IdiomaDocumento) => Promise<IdiomaReporteState>;
}) {
  const t = useTranslations("firma");
  const [guardando, startTransition] = useTransition();
  const [resultado, setResultado] = useState<IdiomaReporteState>({});
  // Lo recién tocado se muestra marcado desde el toque, sin esperar a que la
  // página vuelva del servidor. Si no se pudo guardar, vuelve a verse el que
  // sigue valiendo.
  const [elegido, setElegido] = useState<IdiomaDocumento | null>(null);

  function cambiar(nuevo: IdiomaDocumento) {
    setElegido(nuevo);
    startTransition(async () => {
      let r: IdiomaReporteState;
      try {
        r = await onCambiar(nuevo);
      } catch {
        // Una petición que no llega no devuelve un error: lanza.
        r = { error: t("sinConexion") };
      }
      setResultado(r);
      if (r.error) setElegido(null);
    });
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <SelectorIdiomaDocumento
        titulo={t("enviarEn")}
        ayuda={t("enviarEnAyuda")}
        valor={elegido ?? idioma}
        onCambiar={cambiar}
        disabled={guardando}
      />
      {resultado.error ? (
        <p role="alert" className="text-sm text-danger">
          {resultado.error}
        </p>
      ) : null}
      {resultado.ok && !guardando ? (
        <p className="text-sm text-success">{resultado.ok}</p>
      ) : null}
    </div>
  );
}

/**
 * El correo al que se manda el reporte: verlo, corregirlo y, una vez
 * terminado, volver a mandarlo.
 *
 * Antes el correo se escribía al firmar y no volvía a aparecer en ningún
 * sitio. Si quedaba mal no había cómo saberlo ni cómo arreglarlo sin borrar la
 * firma, y si el envío fallaba no había cómo repetirlo sin reabrir el reporte.
 */
function CorreoDelFirmante({
  correo,
  idioma,
  terminado,
  ultimoEnvio,
  onCorregir,
  onCambiarIdioma,
  onReenviar,
}: {
  correo: string | null;
  idioma: IdiomaDocumento;
  terminado: boolean;
  ultimoEnvio: UltimoEnvio | null;
  onCambiarIdioma: (idioma: IdiomaDocumento) => Promise<IdiomaReporteState>;
  onCorregir: (estado: CorreoFirmaState, formData: FormData) => Promise<CorreoFirmaState>;
  onReenviar: () => Promise<ReenviarState>;
}) {
  const t = useTranslations("firma");
  const [editando, setEditando] = useState(false);

  // Una petición que no llega no devuelve un error: lanza. Se atrapa aquí para
  // decirlo junto al botón, en vez de dejar que tumbe la pantalla.
  const [correccion, corregir, guardando] = useActionState<CorreoFirmaState, FormData>(
    async (previo, formData) => {
      try {
        const resultado = await onCorregir(previo, formData);
        if (resultado.ok) setEditando(false);
        return resultado;
      } catch {
        return { error: t("sinConexion") };
      }
    },
    {},
  );
  const [envio, reenviar, enviando] = useActionState<ReenviarState, FormData>(async () => {
    try {
      return await onReenviar();
    } catch {
      return { error: t("sinConexion") };
    }
  }, {});

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("correoQuienFirma")}
          </p>
          <p className="break-all text-sm text-text">{correo ?? t("sinCorreo")}</p>
        </div>
        {editando ? null : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:border-brand"
          >
            {t("corregirCorreo")}
          </button>
        )}
      </div>

      {editando ? (
        <form action={corregir} className="space-y-2">
          <label htmlFor="correo-firmante" className="sr-only">
            {t("correoQuienFirma")}
          </label>
          <input
            id="correo-firmante"
            name="signatureEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            maxLength={200}
            defaultValue={correo ?? ""}
            placeholder={t("placeholderCorreo")}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {guardando ? t("guardando") : t("guardarCorreo")}
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:text-text"
            >
              {t("cancelar")}
            </button>
          </div>
        </form>
      ) : null}

      {correccion.error ? (
        <p role="alert" className="text-sm text-danger">
          {correccion.error}
        </p>
      ) : null}
      {correccion.ok && !editando ? (
        <p className="text-sm text-success">{correccion.ok}</p>
      ) : null}

      <IdiomaDelEnvio idioma={idioma} onCambiar={onCambiarIdioma} />

      {/* Mientras el reporte está abierto no se manda nada: para eso está el
          botón de terminar. Terminado, aquí se ve si salió y se puede repetir. */}
      {terminado ? (
        <div className="space-y-2 border-t border-border pt-3">
          {ultimoEnvio ? (
            <p
              role={ultimoEnvio.salio ? undefined : "alert"}
              className={`text-sm ${ultimoEnvio.salio ? "text-muted" : "text-danger"}`}
            >
              {ultimoEnvio.salio
                ? t("enviadoA", { correo: ultimoEnvio.correo, fecha: ultimoEnvio.fecha })
                : t("noSalioA", { correo: ultimoEnvio.correo, fecha: ultimoEnvio.fecha })}
            </p>
          ) : null}

          <form action={reenviar}>
            <button
              type="submit"
              disabled={enviando || editando || !correo}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enviando ? t("reenviando") : t("reenviar")}
            </button>
          </form>

          {envio.error ? (
            <p role="alert" className="text-sm text-danger">
              {envio.error}
            </p>
          ) : null}
          {envio.ok ? <p className="text-sm text-success">{envio.ok}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bloque de firma del reporte.
 *
 * Si ya está firmado muestra la imagen, quién firmó y cuándo. Si no, muestra el
 * pad para firmar. Nunca los dos a la vez: tener el pad visible bajo una firma
 * ya hecha invita a firmar dos veces sin querer.
 */
export function SignatureBlock({
  firmaUrl,
  firmanteNombre,
  firmadoEl,
  correo,
  idioma,
  ultimoEnvio,
  nombrePorDefecto,
  onFirmar,
  onBorrar,
  onCorregirCorreo,
  onCambiarIdioma,
  onReenviar,
  soloLectura = false,
}: {
  firmaUrl: string | null;
  firmanteNombre: string | null;
  firmadoEl: string | null;
  /** A dónde se manda el reporte. Se escribe al firmar y se puede corregir después. */
  correo: string | null;
  /**
   * En qué idioma salen el PDF y el correo. Viene el del cliente; se elige
   * junto al correo, al firmar, y se puede cambiar después.
   */
  idioma: IdiomaDocumento;
  ultimoEnvio: UltimoEnvio | null;
  nombrePorDefecto: string;
  onFirmar: (estado: FirmaState, formData: FormData) => Promise<FirmaState>;
  onBorrar: () => void | Promise<void>;
  onCorregirCorreo: (
    estado: CorreoFirmaState,
    formData: FormData,
  ) => Promise<CorreoFirmaState>;
  onCambiarIdioma: (idioma: IdiomaDocumento) => Promise<IdiomaReporteState>;
  onReenviar: () => Promise<ReenviarState>;
  /**
   * El reporte está terminado: se ve la firma, pero ni se reemplaza ni se
   * borra. Nunca se muestra el pad en este modo, ni siquiera si por algún
   * motivo no hubiera firma todavía — un reporte terminado sin firma no
   * debería poder existir (`finalizarReporteAction` la exige), pero esta
   * pantalla no depende de esa garantía para quedarse de solo lectura.
   *
   * El correo y el idioma son la excepción: se pueden cambiar también
   * terminado, porque es justo entonces cuando se descubre que no llegó, o
   * que llegó en el idioma que no era.
   */
  soloLectura?: boolean;
}) {
  const t = useTranslations("firma");

  if (firmaUrl) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text">{firmanteNombre}</p>
            <p className="text-xs text-muted">{t("firmadoEl", { fecha: firmadoEl ?? "" })}</p>
          </div>
          {soloLectura ? null : <BotonBorrarFirma onBorrar={onBorrar} />}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- la ruta es
            autenticada y el optimizador de Next no puede leerla. */}
        <img
          src={firmaUrl}
          alt={t("firmaDe", { nombre: firmanteNombre ?? t("elResponsable") })}
          className="h-40 w-full rounded-xl border border-border bg-white object-contain"
        />

        <CorreoDelFirmante
          correo={correo}
          idioma={idioma}
          terminado={soloLectura}
          ultimoEnvio={ultimoEnvio}
          onCorregir={onCorregirCorreo}
          onCambiarIdioma={onCambiarIdioma}
          onReenviar={onReenviar}
        />
      </div>
    );
  }

  if (soloLectura) {
    return <p className="text-sm italic text-muted">{t("sinFirmarBloqueado")}</p>;
  }

  return (
    <SignaturePad action={onFirmar} nombrePorDefecto={nombrePorDefecto} idioma={idioma} />
  );
}
