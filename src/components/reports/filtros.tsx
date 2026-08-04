import { useTranslations } from "next-intl";

import { FilterChip, FilterGroupLabel } from "@/components/filter-chip";
import type { Empresa } from "@/lib/queries/companies";

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
  const t = useTranslations("filtros");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterGroupLabel>{t("empresa")}</FilterGroupLabel>
      <FilterChip href={hrefPara({ empresa: null })} activo={!empresaId}>
        {t("todas")}
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
