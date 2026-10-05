"use client";

import { useEffect } from "react";

/**
 * Último recurso: se muestra cuando falla el propio layout raíz, o un error
 * que ninguna otra frontera atrapó.
 *
 * Reemplaza al documento entero, así que no tiene nada de lo que el layout
 * raíz aporta: ni la hoja de estilos, ni las fuentes, ni el proveedor de
 * traducciones. Por eso los estilos van en línea y el texto se elige aquí
 * mismo, por el idioma del navegador — no puede depender de nada que también
 * pueda haber fallado. Los colores son los de `globals.css`, copiados.
 */

const TEXTOS = {
  es: {
    titulo: "Algo no salió bien",
    texto:
      "La página no se pudo mostrar. Lo que ya habías guardado no se perdió. Puede ser un corte de señal: vuelve a intentarlo.",
    reintentar: "Reintentar",
    inicio: "Ir al inicio",
    codigo: "Código para soporte",
  },
  en: {
    titulo: "Something went wrong",
    texto:
      "The page could not be displayed. What you had already saved was not lost. It may be a connection drop: try again.",
    reintentar: "Try again",
    inicio: "Go to home",
    codigo: "Support code",
  },
  pt: {
    titulo: "Algo não deu certo",
    texto:
      "A página não pôde ser exibida. O que você já tinha salvado não foi perdido. Pode ser uma queda de sinal: tente de novo.",
    reintentar: "Tentar de novo",
    inicio: "Ir para o início",
    codigo: "Código para suporte",
  },
} as const;

function textos() {
  const idioma =
    typeof navigator === "undefined" ? "es" : navigator.language.slice(0, 2).toLowerCase();
  return idioma === "en" || idioma === "pt" ? TEXTOS[idioma] : TEXTOS.es;
}

export default function ErrorGlobal({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = textos();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#0c0c0e",
          color: "#f0f0f2",
        }}
      >
        <title>{t.titulo}</title>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 12px" }}>{t.titulo}</h1>
          <p style={{ maxWidth: 360, margin: 0, fontSize: 14, lineHeight: 1.5, color: "#a3a3ad" }}>
            {t.texto}
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 600,
              background: "#17a2b8",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            {t.reintentar}
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              borderRadius: 12,
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid #2b2b31",
              color: "#f0f0f2",
              textDecoration: "none",
            }}
          >
            {t.inicio}
          </a>
        </div>

        {error.digest ? (
          <p style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: "#a3a3ad" }}>
            {t.codigo}: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
