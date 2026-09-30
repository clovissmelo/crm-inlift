"use client";

import { History } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GeoZone = { id: number; name: string; ibge_count: number };
type GeoMunicipality = {
  ibge_code: number;
  name: string;
  immediate_region_id: number | null;
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
  municipalities: Array<{
    ibge_code: number;
    name: string;
    ibge_immediate_region_id?: number | null;
    ibge_immediate_region_name?: string | null;
    commercial_zone_id?: number | null;
  }>;
  commercial_zone_ids: number[];
};

type GenerationIndicator = {
  status: string;
  last_at: string;
  run_id: number;
};

const ALL_ZONES = "";

type Props = {
  uf: string;
  ufOptions: UfOption[];
  onUfChange: (uf: string) => void;
  allCities: boolean;
  onAllCitiesChange: (v: boolean) => void;
  onSelectionChange: (payload: CitySelectionPayload) => void;
  productId: number | "";
  disabled?: boolean;
};

const RUN_STATUS_PT: Record<string, string> = {
  running: "Em execução",
  paused: "Pausada",
  completed: "Concluída",
  partial: "Parcial",
  failed: "Falhou"
};

function formatIndicatorDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

function HistoryIcon({ ind }: { ind: GenerationIndicator }) {
  const date = formatIndicatorDate(ind.last_at);
  const statusLabel = RUN_STATUS_PT[ind.status] ?? ind.status;
  const title = `Já houve geração para este produto nesta cidade. Última execução: ${date} (${statusLabel}).`;
  return (
    <span className="lead-geo-history-icon" title={title} aria-label={title} role="img">
      <History size={16} aria-hidden="true" />
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
  disabled
}: Props) {
  const [geo, setGeo] = useState<GeoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState<string>(ALL_ZONES);
  const [checkedIbge, setCheckedIbge] = useState<Set<number>>(new Set());
  const [indicators, setIndicators] = useState<Record<string, GenerationIndicator>>({});
  const fetchGenerationRef = useRef(0);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onAllCitiesChangeRef = useRef(onAllCitiesChange);
  onSelectionChangeRef.current = onSelectionChange;
  onAllCitiesChangeRef.current = onAllCitiesChange;

  const emitSelection = useCallback(
    (ibge: Set<number>, geoData: GeoResponse | null) => {
      if (!geoData) {
        onSelectionChange({ municipalities: [], commercial_zone_ids: [] });
        return;
      }
      const municipalities: CitySelectionPayload["municipalities"] = [];
      for (const code of ibge) {
        const city = geoData.municipalities.find((c) => c.ibge_code === code);
        if (!city) continue;
        const regionName =
          geoData.zones.find((z) => z.id === city.immediate_region_id)?.name ?? null;
        municipalities.push({
          ibge_code: city.ibge_code,
          name: city.name,
          ibge_immediate_region_id: city.immediate_region_id,
          ibge_immediate_region_name: regionName,
          commercial_zone_id: null
        });
      }
      onSelectionChange({ municipalities, commercial_zone_ids: [] });
    },
    [onSelectionChange]
  );

  useEffect(() => {
    setSelectedZoneId(ALL_ZONES);
    setCheckedIbge(new Set());
    setCityFilter("");
    setZoneFilter("");
    setIndicators({});
    onAllCitiesChangeRef.current(false);
    onSelectionChangeRef.current({ municipalities: [], commercial_zone_ids: [] });
    setGeo(null);
    setGeoError(null);
    if (!uf || uf.length !== 2) return;

    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    setGeoError(null);

    void fetch(`/api/admin/lead-generation/geo?uf=${encodeURIComponent(uf)}`)
      .then(async (r) => {
        const data = (await r.json()) as GeoResponse & { error?: string };
        if (!r.ok) throw new Error(data.error ?? "Falha ao carregar localidades");
        if (fetchGenerationRef.current !== generation) return;
        setGeo(data);
      })
      .catch((e: unknown) => {
        if (fetchGenerationRef.current !== generation) return;
        setGeo(null);
        setGeoError(e instanceof Error ? e.message : "Erro ao carregar IBGE");
      })
      .finally(() => {
        if (fetchGenerationRef.current === generation) setLoading(false);
      });
  }, [uf]);

  const ufList = ufOptions.length > 0 ? ufOptions : [];

  const filteredZones = useMemo(() => {
    const list = geo?.zones ?? [];
    const q = zoneFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((z) => z.name.toLowerCase().includes(q));
  }, [geo?.zones, zoneFilter]);

  const citiesInScope = useMemo(() => {
    const all = geo?.municipalities ?? [];
    if (selectedZoneId === ALL_ZONES) return all;
    const zoneId = Number(selectedZoneId);
    if (!Number.isFinite(zoneId)) return all;
    return all.filter((c) => c.immediate_region_id === zoneId || c.zone_ids.includes(zoneId));
  }, [geo?.municipalities, selectedZoneId]);

  const q = cityFilter.trim().toLowerCase();
  const filteredCities = citiesInScope.filter((c) => !q || c.name.toLowerCase().includes(q));

  useEffect(() => {
    if (selectedZoneId === ALL_ZONES) return;
    const zoneId = Number(selectedZoneId);
    setCheckedIbge((prev) => {
      const next = new Set([...prev].filter((code) => {
        const city = geo?.municipalities.find((c) => c.ibge_code === code);
        if (!city) return false;
        return city.immediate_region_id === zoneId || city.zone_ids.includes(zoneId);
      }));
      if (next.size === prev.size && [...next].every((c) => prev.has(c))) return prev;
      emitSelection(next, geo);
      return next;
    });
  }, [selectedZoneId, geo, emitSelection]);

  const visibleCodes = useMemo(
    () => filteredCities.map((c) => c.ibge_code).filter((c) => c > 0),
    [filteredCities]
  );

  const visibleCodesKey = visibleCodes.join(",");

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
          product_id: productId,
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
  }, [productId, visibleCodesKey, visibleCodes]);

  const toggleCity = (m: GeoMunicipality, on: boolean) => {
    const nextIbge = new Set(checkedIbge);
    if (on) nextIbge.add(m.ibge_code);
    else nextIbge.delete(m.ibge_code);
    setCheckedIbge(nextIbge);
    emitSelection(nextIbge, geo);
  };

  function clearManualSelection() {
    setCheckedIbge(new Set());
    onSelectionChange({ municipalities: [], commercial_zone_ids: [] });
  }

  function retryLoad() {
    if (!uf || uf.length !== 2) return;
    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    setGeoError(null);
    void fetch(`/api/admin/lead-generation/geo?uf=${encodeURIComponent(uf)}`)
      .then(async (r) => {
        const data = (await r.json()) as GeoResponse & { error?: string };
        if (!r.ok) throw new Error(data.error ?? "Falha ao carregar localidades");
        if (fetchGenerationRef.current !== generation) return;
        setGeo(data);
      })
      .catch((e: unknown) => {
        if (fetchGenerationRef.current !== generation) return;
        setGeo(null);
        setGeoError(e instanceof Error ? e.message : "Erro ao carregar IBGE");
      })
      .finally(() => {
        if (fetchGenerationRef.current === generation) setLoading(false);
      });
  }

  const totalMuni = geo?.municipalities.length ?? 0;
  const ufSelected = uf.length === 2;
  const zoneDisabled = !ufSelected || loading || !geo;

  return (
    <div className="lead-geo-picker">
      {geo?.ibge_warning ? <p className="alert alert-warning lead-geo-ibge-warn">{geo.ibge_warning}</p> : null}
      {geoError ? (
        <div className="alert alert-error lead-geo-error">
          <p>{geoError}</p>
          <button className="button button--ghost" type="button" onClick={retryLoad}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      <div className="lead-geo-grid-head">
        <span>UF</span>
        <span>Zona (IBGE)</span>
        <span>Cidades</span>
      </div>

      <div className="lead-geo-grid">
        <div className="lead-geo-col lead-geo-col-uf">
          <select
            className="input"
            value={uf}
            disabled={disabled}
            onChange={(e) => onUfChange(e.target.value)}
          >
            <option value="">Selecione uma UF</option>
            {ufList.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} — {u.name}
              </option>
            ))}
          </select>
          {ufSelected && geo ? (
            <p className="muted lead-geo-meta">
              {totalMuni} municípios · {geo.zones.length} zonas · fonte {geo.source}
              {geo.has_motor_mapping ? ` · ${geo.anp_supported_count} com ANP` : null}
            </p>
          ) : null}
          {ufSelected ? (
            <label className="lead-geo-all-uf">
              <input
                type="checkbox"
                checked={allCities}
                disabled={disabled || totalMuni === 0 || loading}
                onChange={(e) => {
                  onAllCitiesChange(e.target.checked);
                  if (e.target.checked) clearManualSelection();
                }}
              />
              <span>Todas da UF ({totalMuni})</span>
            </label>
          ) : null}
        </div>

        <div className="lead-geo-col">
          {!ufSelected ? (
            <p className="muted">Selecione uma UF para carregar zonas.</p>
          ) : loading && !geo ? (
            <p className="muted">Consultando IBGE…</p>
          ) : (
            <>
              <input
                className="input lead-geo-filter"
                type="search"
                placeholder="Filtrar zona…"
                value={zoneFilter}
                disabled={disabled || zoneDisabled}
                onChange={(e) => setZoneFilter(e.target.value)}
              />
              <select
                className="input"
                value={selectedZoneId}
                disabled={disabled || zoneDisabled}
                onChange={(e) => setSelectedZoneId(e.target.value)}
              >
                <option value={ALL_ZONES}>Todas as zonas</option>
                {filteredZones.map((z) => (
                  <option key={z.id} value={String(z.id)}>
                    {z.name} ({z.ibge_count})
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <div className="lead-geo-col">
          {!ufSelected ? (
            <p className="muted">Selecione uma UF para carregar cidades.</p>
          ) : loading && !geo ? (
            <p className="muted">Consultando IBGE…</p>
          ) : allCities ? (
            <p className="muted">Todos os municípios da UF serão incluídos na geração.</p>
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
                <p className="muted lead-geo-ind-hint">Selecione um produto para ver histórico de geração por cidade.</p>
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
                        {ind ? <HistoryIcon ind={ind} /> : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
