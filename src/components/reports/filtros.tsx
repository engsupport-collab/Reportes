import { FilterChip, FilterGroupLabel } from "@/components/filter-chip";
import { ETIQUETAS_TRABAJO, TIPOS_SERVICIO } from "@/lib/etiquetas";
import type { Empresa } from "@/lib/queries/companies";

/**
 * Filtros rápidos por tipo de servicio y por etiqueta. El filtrado ocurre en
 * SQL, no en el navegador — cada chip es un enlace a una URL con los
 * parámetros ya resueltos.
 */
export function FiltrosClasificacion({
  serviceType,
  etiqueta,
  hrefPara,
}: {
  serviceType?: string;
  etiqueta?: string;
  hrefPara: (cambios: {
    serviceType?: string | null;
    etiqueta?: string | null;
  }) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterGroupLabel>Servicio</FilterGroupLabel>
        {TIPOS_SERVICIO.map((tipo) => {
          const activo = serviceType === tipo.id;
          return (
            <FilterChip
              key={tipo.id}
              href={hrefPara({ serviceType: activo ? null : tipo.id })}
              activo={activo}
            >
              {tipo.label}
            </FilterChip>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterGroupLabel>Etiqueta</FilterGroupLabel>
        {ETIQUETAS_TRABAJO.map((marca) => {
          const activo = etiqueta === marca.id;
          return (
            <FilterChip
              key={marca.id}
              href={hrefPara({ etiqueta: activo ? null : marca.id })}
              activo={activo}
            >
              {marca.label}
            </FilterChip>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Filtro por empresa, solo para el admin.
 *
 * "Todas" no es un valor de empresa más: es la ausencia de filtro, que
 * `hrefPara` interpreta como `empresa: null`. Es el estado por defecto — el
 * admin ve las dos empresas mezcladas hasta que elige acotar a una.
 */
export function FiltroEmpresa({
  empresas,
  empresaId,
  hrefPara,
}: {
  empresas: Empresa[];
  empresaId?: string;
  hrefPara: (cambios: { empresa?: string | null }) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterGroupLabel>Empresa</FilterGroupLabel>
      <FilterChip href={hrefPara({ empresa: null })} activo={!empresaId}>
        Todas
      </FilterChip>
      {empresas.map((e) => (
        <FilterChip
          key={e.id}
          href={hrefPara({ empresa: empresaId === e.id ? null : e.id })}
          activo={empresaId === e.id}
        >
          {e.name}
        </FilterChip>
      ))}
    </div>
  );
}
