"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type GeoZone = { id: number; name: string; ibge_count: number };
type GeoMunicipality = {
  ibge_code: number;
  name: string;
  zone_ids: number[];
  anp_supported: boolean;
};

type GeoResponse = {
  uf: string;
  has_motor_mapping: boolean;
  source: string;
  ibge_warning: string | null;
  anp_supported_count: number;
  zones: GeoZone[];
  municipalities: GeoMunicipality[];
};

export type UfOption = { code: string; name: string; has_motor_mapping: boolean };

export type CitySelectionPayload = {
  municipalities: Array<{ ibge_code: number; name: string; commercial_zone_id?: number | null }>;
  commercial_zone_ids: number[];
};

type GenerationIndicator = {
  status: "completed" | "partial" | "failed";
  last_at: string;
  run_id: number;
};

type Props = {
  uf: string;
  ufOptions: UfOption[];
  onUfChange: (uf: string) => void;
  allCities: boolean;
  onAllCitiesChange: (v: boolean) => void;
  onSelectionChange: (payload: CitySelectionPayload) => void;
  productId: number | "";
  segment: string;
  disabled?: boolean;
};

function formatIndicatorDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

function IndicatorBadge({ ind }: { ind: GenerationIndicator }) {
  const date = formatIndicatorDate(ind.last_at);
  if (ind.status === "completed") {
    return (
      <span className="lead-geo-ind lead-geo-ind--ok" title={`Geração concluída em ${date}`}>
        ✓ {date}
      </span>
    );
  }
  if (ind.status === "partial") {
    return (
      <span className="lead-geo-ind lead-geo-ind--partial" title={`Execução parcial em ${date}`}>
        ◐ {date}
      </span>
    );
  }
  return (
    <span className="lead-geo-ind lead-geo-ind--fail" title={`Falhou em ${date}`}>
      ✕ {date}
    </span>
  );
}

export function AdminNovosLeadsCityPicker({
  uf,
  ufOptions,
  onUfChange,
  allCities,
  onAllCitiesChange,
  onSelectionChange,
  productId,
  segment,
  disabled
}: Props) {
  const [geo, setGeo] = useState<GeoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState("");
  const [checkedZones, setCheckedZones] = useState<Set<number>>(new Set());
  const [checkedIbge, setCheckedIbge] = useState<Set<number>>(new Set());
  const [indicators, setIndicators] = useState<Record<string, GenerationIndicator>>({});

  useEffect(() => {
    setCheckedZones(new Set());
    setCheckedIbge(new Set());
    setCityFilter("");
    setIndicators({});
    onAllCitiesChange(false);
    onSelectionChange({ municipalities: [], commercial_zone_ids: [] });
  }, [uf, onAllCitiesChange, onSelectionChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGeoError(null);
    void fetch(`/api/admin/lead-generation/geo?uf=${encodeURIComponent(uf)}`)
      .then(async (r) => {
        const data = (await r.json()) as GeoResponse & { error?: string };
        if (!r.ok) throw new Error(data.error ?? "Falha ao carregar municípios");
        if (!cancelled) setGeo(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setGeo(null);
          setGeoError(e instanceof Error ? e.message : "Erro ao carregar IBGE");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uf]);

  const zoneToIbge = useMemo(() => {
    const m = new Map<number, number[]>();
    if (!geo) return m;
    for (const z of geo.zones) {
      const codes = geo.municipalities.filter((c) => c.zone_ids.includes(z.id)).map((c) => c.ibge_code);
      m.set(z.id, codes);
    }
    return m;
  }, [geo]);

  const emitSelection = useCallback(
    (zones: Set<number>, ibge: Set<number>) => {
      if (!geo) {
        onSelectionChange({ municipalities: [], commercial_zone_ids: [...zones] });
        return;
      }
      const municipalities: CitySelectionPayload["municipalities"] = [];
      for (const code of ibge) {
        const city = geo.municipalities.find((c) => c.ibge_code === code);
        if (!city) continue;
        const zoneId = city.zone_ids.find((zid) => zones.has(zid)) ?? null;
        municipalities.push({
          ibge_code: city.ibge_code,
          name: city.name,
          commercial_zone_id: zoneId
        });
      }
      onSelectionChange({ municipalities, commercial_zone_ids: [...zones] });
    },
    [geo, onSelectionChange]
  );

  const toggleZone = (zoneId: number, on: boolean) => {
    const nextZones = new Set(checkedZones);
    const nextIbge = new Set(checkedIbge);
    const inZone = zoneToIbge.get(zoneId) ?? [];
    if (on) {
      nextZones.add(zoneId);
      for (const c of inZone) nextIbge.add(c);
    } else {
      nextZones.delete(zoneId);
      for (const c of inZone) {
        const still = [...nextZones].some((zid) => (zoneToIbge.get(zid) ?? []).includes(c));
        if (!still) nextIbge.delete(c);
      }
    }
    setCheckedZones(nextZones);
    setCheckedIbge(nextIbge);
    emitSelection(nextZones, nextIbge);
  };

  const toggleCity = (m: GeoMunicipality, on: boolean) => {
    const nextIbge = new Set(checkedIbge);
    if (on) nextIbge.add(m.ibge_code);
    else nextIbge.delete(m.ibge_code);
    const nextZones = new Set(checkedZones);
    for (const z of geo?.zones ?? []) {
      const rc = zoneToIbge.get(z.id) ?? [];
      if (rc.length && rc.every((c) => nextIbge.has(c))) nextZones.add(z.id);
      else nextZones.delete(z.id);
    }
    setCheckedIbge(nextIbge);
    setCheckedZones(nextZones);
    emitSelection(nextZones, nextIbge);
  };

  const q = cityFilter.trim().toLowerCase();
  const filteredCities = (geo?.municipalities ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));

  const visibleCodes = useMemo(
    () => filteredCities.map((c) => c.ibge_code).filter((c) => c > 0),
    [filteredCities]
  );

  useEffect(() => {
    if (productId === "" || visibleCodes.length === 0) {
      setIndicators({});
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void fetch("/api/admin/lead-generation/geo/indicators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uf,
          product_id: productId,
          segment,
          ibge_codes: visibleCodes.slice(0, 500)
        })
      })
        .then((r) => r.json())
        .then((data: { indicators?: Record<string, GenerationIndicator> }) => {
          if (!cancelled) setIndicators(data.indicators ?? {});
        })
        .catch(() => {
          if (!cancelled) setIndicators({});
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [uf, productId, segment, visibleCodes.join(",")]);

  const ufList =
    ufOptions.length > 0 ? ufOptions : [{ code: "RS", name: "Rio Grande do Sul", has_motor_mapping: true }];

  const totalMuni = geo?.municipalities.length ?? 0;

  function clearManualSelection() {
    setCheckedZones(new Set());
    setCheckedIbge(new Set());
    onSelectionChange({ municipalities: [], commercial_zone_ids: [] });
  }

  return (
    <div className="lead-geo-picker">
      {geo?.ibge_warning ? <p className="alert alert-warning lead-geo-ibge-warn">{geo.ibge_warning}</p> : null}
      {geoError ? <p className="alert alert-error">{geoError}</p> : null}

      <div className="lead-geo-grid-head">
        <span>UF</span>
        <span>Cidades (IBGE)</span>
        <span>Zona comercial</span>
      </div>

      <div className="lead-geo-grid">
        <div className="lead-geo-col lead-geo-col-uf">
          <select className="input" value={uf} disabled={disabled} onChange={(e) => onUfChange(e.target.value)}>
            {ufList.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code}
              </option>
            ))}
          </select>
          <p className="muted lead-geo-uf-name">{ufList.find((x) => x.code === uf)?.name ?? uf}</p>
          {geo ? (
            <p className="muted lead-geo-meta">
              {totalMuni} municípios · fonte {geo.source}
              {geo.has_motor_mapping ? ` · ${geo.anp_supported_count} com ANP` : null}
            </p>
          ) : null}
          <label className="lead-geo-all-uf">
            <input
              type="checkbox"
              checked={allCities}
              disabled={disabled || totalMuni === 0}
              onChange={(e) => {
                onAllCitiesChange(e.target.checked);
                if (e.target.checked) clearManualSelection();
              }}
            />
            <span>Todas da UF ({totalMuni})</span>
          </label>
        </div>

        <div className="lead-geo-col">
          {loading && !geo ? (
            <p className="muted">Consultando IBGE…</p>
          ) : allCities ? (
            <p className="muted">Todos os municípios da UF na consulta IBGE (motor ANP onde houver mapa).</p>
          ) : totalMuni === 0 ? (
            <p className="muted">Nenhum município carregado para esta UF.</p>
          ) : (
            <>
              <input
                className="input lead-geo-filter"
                type="search"
                placeholder="Filtrar cidade…"
                value={cityFilter}
                disabled={disabled}
                onChange={(e) => setCityFilter(e.target.value)}
              />
              {productId === "" ? (
                <p className="muted lead-geo-ind-hint">Selecione produto e segmento para ver histórico por cidade.</p>
              ) : null}
              <ul className="lead-geo-list lead-geo-list-cities">
                {filteredCities.map((c) => {
                  const ind = indicators[String(c.ibge_code)];
                  return (
                    <li key={c.ibge_code}>
                      <label className="lead-geo-row">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={checkedIbge.has(c.ibge_code)}
                          onChange={(e) => toggleCity(c, e.target.checked)}
                        />
                        <span className="lead-geo-label">
                          {c.name}
                          <span className="muted lead-geo-ibge-code"> · {c.ibge_code}</span>
                          {!c.anp_supported && geo?.has_motor_mapping ? (
                            <span className="lead-geo-no-anp" title="Sem mapa ANP local">
                              {" "}
                              (sem ANP)
                            </span>
                          ) : null}
                        </span>
                        {ind ? <IndicatorBadge ind={ind} /> : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="lead-geo-col">
          {geo && !allCities ? (
            geo.zones.length === 0 ? (
              <p className="muted">Nenhuma zona comercial cadastrada nesta UF.</p>
            ) : (
              <ul className="lead-geo-list">
                {geo.zones.map((z) => (
                  <li key={z.id}>
                    <label className="lead-geo-row">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={checkedZones.has(z.id)}
                        onChange={(e) => toggleZone(z.id, e.target.checked)}
                      />
                      <span className="lead-geo-label">
                        {z.name}
                        <span className="muted"> ({z.ibge_count})</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="muted">{allCities ? "—" : "Selecione cidades ou zonas."}</p>
          )}
        </div>
      </div>
    </div>
  );
}
