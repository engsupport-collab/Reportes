/**
 * Mide el tiempo real de las consultas clave contra el volumen de prueba.
 *
 *   npm run seed:demo -- 2000   (una vez, para tener el volumen)
 *   npm run medir:rendimiento
 *
 * No es una prueba de aprobar/fallar: es una medición para confirmar o
 * refutar lo que dice PLAN.md, sección 7.2 ("2.000 filas no son un problema
 * para SQLite"). Corre contra Turso real, no contra una base local — la
 * latencia de red hacia Turso es justamente la que más importa en producción.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function medir<T>(etiqueta: string, fn: () => Promise<T>): Promise<T> {
  const inicio = performance.now();
  const resultado = await fn();
  const ms = performance.now() - inicio;
  const marca = ms < 50 ? "rápido" : ms < 200 ? "aceptable" : "revisar";
  console.log(`  ${ms.toFixed(1).padStart(7)} ms  [${marca}]  ${etiqueta}`);
  return resultado;
}

async function main() {
  const { listarReportes, contarIncompletos, contarSinFirma } = await import(
    "../src/lib/queries/reports"
  );
  const { obtenerResumen, empleadosDeEmpresa } = await import(
    "../src/lib/queries/dashboard"
  );

  const [totalCorp, totalSaas] = await Promise.all([
    listarReportes({ companyId: "corp", porPagina: 1 }),
    listarReportes({ companyId: "saas", porPagina: 1 }),
  ]);
  console.log(
    `\nVolumen real: Corp=${totalCorp.total}  SaaS=${totalSaas.total}  Total=${totalCorp.total + totalSaas.total}\n`,
  );

  console.log("Vista General del empleado (una empresa, paginada a 20)\n");
  await medir("primera página, sin filtros", () =>
    listarReportes({ companyId: "corp", porPagina: 20 }),
  );
  await medir("página 30 (fondo de la lista, OFFSET alto)", () =>
    listarReportes({ companyId: "corp", porPagina: 20, pagina: 30 }),
  );
  await medir("búsqueda de texto (LIKE) sobre toda la empresa", () =>
    listarReportes({ companyId: "corp", buscar: "Mantenimiento", porPagina: 20 }),
  );
  await medir("filtro por etiqueta (EXISTS + índice)", () =>
    listarReportes({ companyId: "corp", etiqueta: "urgencia", porPagina: 20 }),
  );
  await medir("solo incompletos (subconsulta correlacionada)", () =>
    listarReportes({ companyId: "corp", soloIncompletos: true, porPagina: 20 }),
  );

  console.log("\nVista Master del admin (las dos empresas mezcladas)\n");
  await medir("lista global sin filtro de empresa (\"todas\")", () =>
    listarReportes({ porPagina: 20 }),
  );
  await medir("lista global, página profunda", () =>
    listarReportes({ porPagina: 20, pagina: 50 }),
  );
  await medir("panel: obtenerResumen() completo, todas las empresas", () =>
    obtenerResumen(),
  );
  await medir("panel: obtenerResumen() filtrado a una empresa", () =>
    obtenerResumen("corp"),
  );
  await medir("conteo de incompletos, todas las empresas", () =>
    contarIncompletos(),
  );
  await medir("conteo de sin firma, todas las empresas", () => contarSinFirma());
  await medir("lista de empleados para el filtro, todas las empresas", () =>
    empleadosDeEmpresa(),
  );

  console.log(
    "\nSi todo cae por debajo de ~200 ms medido desde este equipo hacia Turso," +
      "\nen Vercel —con la función en la misma región que la base— debería ser" +
      "\nigual o mejor: es la misma consulta, sin el salto adicional de estar" +
      "\ncorriendo fuera de la nube donde vive la base.\n",
  );
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
