import type { Metadata } from "next";
import {
  Caveat,
  Dancing_Script,
  Geist,
  Geist_Mono,
  Great_Vibes,
} from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Tipografías para la firma escrita.
 *
 * Son tres para que quien firma elija la que más se parezca a su letra; una
 * sola haría que todas las firmas del sistema fueran idénticas salvo por el
 * texto. Van por `next/font`, que las descarga en el build y las sirve desde
 * el propio dominio: así no hay petición a Google en tiempo de ejecución.
 *
 * Subconjunto `latin`, que cubre las tildes y la eñe.
 */
const firmaCursiva = Dancing_Script({
  variable: "--font-firma-cursiva",
  subsets: ["latin"],
  weight: "600",
});

const firmaManuscrita = Caveat({
  variable: "--font-firma-manuscrita",
  subsets: ["latin"],
  weight: "600",
});

const firmaElegante = Great_Vibes({
  variable: "--font-firma-elegante",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Gestor de Reportes",
  description: "Sistema interno de reportes de trabajo",
  // Es una herramienta interna: no debe aparecer en buscadores.
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // El único lugar donde se lee el idioma sin pasar por next-intl: el
  // atributo `lang` del documento no es un mensaje traducible, es metadato
  // para el lector de pantalla y el corrector ortográfico del navegador.
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${firmaCursiva.variable} ${firmaManuscrita.variable} ${firmaElegante.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        {/* El proveedor va aquí, en la raíz, y no más abajo: hace falta tanto
            en la pantalla de ingreso como en toda la aplicación autenticada, y
            son subárboles distintos sin un layout común más específico. */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
