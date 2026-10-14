import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/lib/auth-guard";
import { csvDeCotizaciones } from "@/lib/exportar-cotizaciones";
import { aValorInput } from "@/lib/fechas";
import {
  type ParametrosCotizaciones,
  aFiltrosDeConsulta,
  leerFiltrosCotizaciones,
} from "@/lib/filtros-cotizaciones";
import { listarCotizacionesParaExportar } from "@/lib/queries/quotes";

/**
 * Exportación de la lista de cotizaciones, en CSV para Excel.
 *
 * Recibe la misma dirección que la pantalla y la lee con la misma función
 * (`leerFiltrosCotizaciones`), y consulta con el mismo filtro y el mismo orden
 * (`listarCotizacionesParaExportar`): el archivo trae exactamente las filas de
 * la pantalla desde la que se pidió, todas y no solo las de la página que se
 * estaba viendo. El filtrado ocurre en la base, nunca trayendo todo para
 * recortarlo aquí.
 *
 * Solo el administrador, igual que la lista: es la única pantalla de
 * cotizaciones y el empleado nunca llega a ella. A cualquier otro se le
 * contesta que no existe, como en las demás rutas que no le tocan.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Sin acceso" }, { status: 404 });
  }

  const ahora = new Date();
  const parametros = Object.fromEntries(
    new URL(request.url).searchParams,
  ) as ParametrosCotizaciones;
  const filtros = leerFiltrosCotizaciones(parametros, {
    empresasPermitidas: user.empresas.map((e) => e.id),
    ahora,
  });

  const [{ items, recortado }, t, tEstados] = await Promise.all([
    listarCotizacionesParaExportar(aFiltrosDeConsulta(filtros)),
    getTranslations("cotizacionesPage"),
    getTranslations("estadosCotizacion"),
  ]);

  const csv = csvDeCotizaciones(items, {
    encabezados: [
      t("colNumero"),
      t("colProyecto"),
      t("colCliente"),
      t("colEmpresa"),
      t("colEstado"),
      t("colOc"),
      t("colEntrega"),
      t("colValor"),
      t("colMoneda"),
      t("exportCreada"),
      t("exportFinalizada"),
      t("colRevisada"),
      t("exportRegistradaPor"),
      t("exportRegistradaEl"),
    ],
    estado: (estado) => tEstados(estado),
    sinFechaRegistrada: t("sinFechaRegistrada"),
    si: t("si"),
    no: t("no"),
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cotizaciones-${aValorInput(ahora)}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Solo si pasó del tope (ver TOPE_EXPORTACION): que se pueda saber que
      // faltan filas sin tener que contarlas.
      ...(recortado ? { "X-Exportacion-Recortada": "1" } : {}),
    },
  });
}
