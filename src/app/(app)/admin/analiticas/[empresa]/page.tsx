import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Barras } from "@/components/admin/barras";
import { GraficaMeses } from "@/components/admin/grafica-meses";
import { requireAdmin } from "@/lib/auth-guard";
import { esEtiquetaValida, esTipoServicioValido } from "@/lib/etiquetas";
import { obtenerAnaliticas } from "@/lib/queries/analytics";

type Params = { params: Promise<{ empresa: string }> };

function Tarjeta({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-text">{titulo}</h2>
      {nota ? <p className="mt-0.5 text-xs text-muted">{nota}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Cifra({
  etiqueta,
  valor,
  nota,
  href,
  alerta,
}: {
  etiqueta: string;
  valor: number;
  nota?: string;
  href?: string;
  alerta?: boolean;
}) {
  const contenido = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {etiqueta}
      </p>
      <p
        className={`mt-1 text-3xl font-semibold ${alerta && valor > 0 ? "text-warning" : "text-text"}`}
      >
        {valor}
      </p>
      {nota ? <p className="mt-0.5 text-xs text-muted">{nota}</p> : null}
    </>
  );

  const clases = `rounded-2xl border p-4 ${
    alerta && valor > 0
      ? "border-warning/30 bg-warning-soft"
      : "border-border bg-surface"
  }`;

  return href ? (
    <Link href={href} className={`${clases} block transition hover:border-brand`}>
      {contenido}
    </Link>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

/**
 * Analíticas de una empresa.
 *
 * La empresa va en la ruta y no en un parámetro de consulta porque aquí sí es
 * una pantalla distinta por empresa, no un filtro sobre la misma: el submenú
 * del rail lleva a una o a la otra, y cada una merece su propia dirección.
 */
export default async function AnaliticasPage({ params }: Params) {
  const user = await requireAdmin();
  const { empresa: idEmpresa } = await params;

  // El id de la URL se valida contra las empresas reales: uno inventado no
  // debe llegar a la consulta.
  const empresa = user.empresas.find((e) => e.id === idEmpresa);
  if (!empresa) notFound();

  const a = await obtenerAnaliticas(empresa.id);
  const hrefReportes = `/admin/reportes?empresa=${empresa.id}`;
  const [t, tEtiquetas] = await Promise.all([
    getTranslations("analiticasPage"),
    getTranslations("etiquetas"),
  ]);

  /**
   * Pone nombre a un reparto que vino por id. Un id que no esté en el
   * catálogo —el vacío de los reportes sin tipo de servicio, o una etiqueta
   * retirada -- se muestra como "Sin definir" en vez de romper la gráfica.
   */
  const conNombre = (datos: { id: string; total: number }[]) =>
    datos.map((d) => ({
      nombre:
        esEtiquetaValida(d.id) || esTipoServicioValido(d.id)
          ? tEtiquetas(d.id)
          : t("sinDefinir"),
      total: d.total,
    }));

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {t("titulo", { empresa: empresa.name })}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t("subtitulo", { empresa: empresa.name })}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Cifra
            etiqueta={t("total")}
            valor={a.total}
            nota={t("desdeInicio")}
            href={hrefReportes}
          />
          <Cifra etiqueta={t("terminados")} valor={a.terminados} />
          <Cifra etiqueta={t("enProceso")} valor={a.enProceso} />
          <Cifra
            etiqueta={t("sinOrden")}
            valor={a.sinOrden}
            nota={t("faltaNumeroOrden")}
            href={`${hrefReportes}&sinorden=1`}
            alerta
          />
        </div>

        <Tarjeta
          titulo={t("reportesPorMes")}
          nota={t("notaReportesPorMes")}
        >
          <GraficaMeses puntos={a.porMes} />
        </Tarjeta>

        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo={t("porTipoServicio")}>
            <Barras datos={conNombre(a.porServicio)} vacio={t("sinDatos")} />
          </Tarjeta>

          <Tarjeta titulo={t("porEtiqueta")} nota={t("notaPorEtiqueta")}>
            <Barras datos={conNombre(a.porEtiqueta)} vacio={t("sinDatos")} />
          </Tarjeta>
        </div>

        <Tarjeta titulo={t("clientesTop")} nota={t("notaClientesTop")}>
          <Barras datos={a.topClientes} vacio={t("sinDatos")} />
        </Tarjeta>

        <Tarjeta
          titulo={t("pendientes")}
          nota={t("notaPendientes")}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Cifra
              etiqueta={t("sinDocumento")}
              valor={a.sinDocumento}
              href={`${hrefReportes}&faltantes=1`}
              alerta
            />
            <Cifra
              etiqueta={t("sinFirmar")}
              valor={a.sinFirma}
              href={`${hrefReportes}&sinfirma=1`}
              alerta
            />
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
