import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Barras } from "@/components/admin/barras";
import { GraficaMeses } from "@/components/admin/grafica-meses";
import { requireAdmin } from "@/lib/auth-guard";
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

  return (
    <AppShell user={user} saludo={false}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            Analíticas · {empresa.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Solo los reportes de {empresa.name}.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Cifra
            etiqueta="Total"
            valor={a.total}
            nota="Desde el inicio"
            href={hrefReportes}
          />
          <Cifra etiqueta="Terminados" valor={a.terminados} />
          <Cifra etiqueta="En proceso" valor={a.enProceso} />
          <Cifra
            etiqueta="Sin orden"
            valor={a.sinOrden}
            nota="Falta el número de orden"
            href={`${hrefReportes}&sinorden=1`}
            alerta
          />
        </div>

        <Tarjeta
          titulo="Reportes por mes"
          nota="Últimos 12 meses, por fecha de creación. El mes actual va empezado, por eso su tramo aparece punteado."
        >
          <GraficaMeses puntos={a.porMes} />
        </Tarjeta>

        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo="Por tipo de servicio">
            <Barras datos={a.porServicio} />
          </Tarjeta>

          <Tarjeta titulo="Por etiqueta" nota="Un reporte puede llevar varias">
            <Barras datos={a.porEtiqueta} />
          </Tarjeta>
        </div>

        <Tarjeta titulo="Clientes con más reportes" nota="Los seis primeros">
          <Barras datos={a.topClientes} />
        </Tarjeta>

        <Tarjeta
          titulo="Pendientes"
          nota="Reportes terminados a los que les falta algo"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Cifra
              etiqueta="Sin documento"
              valor={a.sinDocumento}
              href={`${hrefReportes}&faltantes=1`}
              alerta
            />
            <Cifra
              etiqueta="Sin firmar"
              valor={a.sinFirma}
              href={`${hrefReportes}&sinfirma=1`}
              alerta
            />
          </div>
        </Tarjeta>
      </div>
    </AppShell>
  );
}
