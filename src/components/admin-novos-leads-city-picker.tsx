"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { citiesForRegionIds } from "@/lib/lead-motor/anp-regions";

type GeoRegion = { id: string; label: string; city_count: number; loaded: boolean };
type GeoCity = { name: string; loaded: boolean; region_ids: string[] };

type GeoResponse = {
  uf: string;
  has_motor_mapping: boolean;
  regions: GeoRegion[];
  cities: GeoCity[];
};

export type UfOption = { code: string; name: string; has_motor_mapping: boolean };

export type CitySelectionPayload = {
  regions: string[];
  cities: string[];
};

type Props = {
  uf: string;
  ufOptions: UfOption[];
  onUfChange: (uf: string) => void;
  allCities: boolean;
  onAllCitiesChange: (v: boolean) => void;
  onSelectionChange: (payload: CitySelectionPayload) => void;
  disabled?: boolean;
};

export function AdminNovosLeadsCityPicker({
  uf,
  ufOptions,
  onUfChange,
  allCities,
  onAllCitiesChange,
  onSelectionChange,
  disabled
}: Props) {
  const [geo, setGeo] = useState<GeoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [cityFilter, setCityFilter] = useState("");
  const [checkedRegions, setCheckedRegions] = useState<Set<string>>(new Set());
  const [checkedCities, setCheckedCities] = useState<Set<string>>(new Set());
  const [geoAppliedForUf, setGeoAppliedForUf] = useState<string | null>(null);

  useEffect(() => {
    setCheckedRegions(new Set());
    setCheckedCities(new Set());
    setCityFilter("");
    setGeoAppliedForUf(null);
    onAllCitiesChange(false);
    onSelectionChange({ regions: [], cities: [] });
  }, [uf, onAllCitiesChange, onSelectionChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/admin/lead-generation/geo?uf=${encodeURIComponent(uf)}`)
      .then((r) => r.json())
      .then((data: GeoResponse) => {
        if (!cancelled) setGeo(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uf]);

  useEffect(() => {
    if (!geo || geo.uf !== uf || geoAppliedForUf === uf) return;
    setGeoAppliedForUf(uf);
    if (geo.has_motor_mapping) {
      onAllCitiesChange(true);
      onSelectionChange({ regions: [], cities: [] });
    }
  }, [geo, uf, geoAppliedForUf, onAllCitiesChange, onSelectionChange]);

  const regionCityMap = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!geo) return m;
    for (const r of geo.regions) {
      m.set(r.id, citiesForRegionIds(uf, [r.id]));
    }
    return m;
  }, [geo, uf]);

  const emitPayload = useCallback(
    (regions: Set<string>, cities: Set<string>) => {
      onSelectionChange({ regions: [...regions], cities: [...cities] });
    },
    [onSelectionChange]
  );

  const toggleRegion = (id: string, on: boolean) => {
    const nextRegions = new Set(checkedRegions);
    const nextCities = new Set(checkedCities);
    const inRegion = regionCityMap.get(id) ?? [];
    if (on) {
      nextRegions.add(id);
      for (const c of inRegion) nextCities.add(c);
    } else {
      nextRegions.delete(id);
      for (const c of inRegion) {
        const stillNeeded = [...nextRegions].some((rid) => (regionCityMap.get(rid) ?? []).includes(c));
        if (!stillNeeded) nextCities.delete(c);
      }
    }
    setCheckedRegions(nextRegions);
    setCheckedCities(nextCities);
    emitPayload(nextRegions, nextCities);
  };

  const toggleCity = (name: string, on: boolean) => {
    const nextCities = new Set(checkedCities);
    if (on) nextCities.add(name);
    else nextCities.delete(name);
    setCheckedCities(nextCities);
    const nextRegions = new Set(checkedRegions);
    for (const r of geo?.regions ?? []) {
      const rc = regionCityMap.get(r.id) ?? [];
      if (rc.length && rc.every((c) => nextCities.has(c))) nextRegions.add(r.id);
      else nextRegions.delete(r.id);
    }
    setCheckedRegions(nextRegions);
    emitPayload(nextRegions, nextCities);
  };

  const q = cityFilter.trim().toLowerCase();
  const filteredCities = (geo?.cities ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));

  const ufList =
    ufOptions.length > 0 ? ufOptions : [{ code: "RS", name: "Rio Grande do Sul", has_motor_mapping: true }];

  return (
    <div className="lead-geo-picker">
      <div className="lead-geo-grid-head">
        <span>UF</span>
        <span>Cidades</span>
        <span>Zona</span>
      </div>

      <div className="lead-geo-grid">
        <div className="lead-geo-col lead-geo-col-uf">
          <select className="input" value={uf} disabled={disabled} onChange={(e) => onUfChange(e.target.value)}>
            {ufList.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code}
                {!u.has_motor_mapping ? " ·" : ""}
              </option>
            ))}
          </select>
          <p className="muted lead-geo-uf-name">{ufList.find((x) => x.code === uf)?.name ?? uf}</p>
          <label className="lead-geo-all-uf">
            <input
              type="checkbox"
              checked={allCities}
              disabled={disabled || !geo?.has_motor_mapping}
              onChange={(e) => {
                onAllCitiesChange(e.target.checked);
                if (e.target.checked) {
                  setCheckedRegions(new Set());
                  setCheckedCities(new Set());
                  onSelectionChange({ regions: [], cities: [] });
                }
              }}
            />
            <span>Todas mapeadas ({geo?.cities.length ?? 0})</span>
          </label>
        </div>

        <div className="lead-geo-col">
          {loading && !geo ? (
            <p className="muted">Carregando…</p>
          ) : geo && !geo.has_motor_mapping ? (
            <p className="muted">Sem mapa ANP nesta UF (RS e PR disponíveis).</p>
          ) : allCities ? (
            <p className="muted">Todas as cidades da UF serão incluídas.</p>
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
              <ul className="lead-geo-list lead-geo-list-cities">
                {filteredCities.map((c) => (
                  <li key={c.name}>
                    <label className="lead-geo-row">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={checkedCities.has(c.name)}
                        onChange={(e) => toggleCity(c.name, e.target.checked)}
                      />
                      <span className="lead-geo-label">{c.name}</span>
                      {c.loaded ? (
                        <span className="lead-geo-loaded" title="Já carregada em execução anterior">
                          ✓
                        </span>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="lead-geo-col">
          {geo && geo.has_motor_mapping && !allCities ? (
            <ul className="lead-geo-list">
              {(geo.regions ?? []).map((r) => (
                <li key={r.id}>
                  <label className="lead-geo-row">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={checkedRegions.has(r.id)}
                      onChange={(e) => toggleRegion(r.id, e.target.checked)}
                    />
                    <span className="lead-geo-label">
                      {r.label}
                      <span className="muted"> ({r.city_count})</span>
                    </span>
                    {r.loaded ? (
                      <span className="lead-geo-loaded" title="Já carregada em execução anterior">
                        ✓
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{allCities ? "—" : "Selecione a UF com mapa."}</p>
          )}
        </div>
      </div>
    </div>
  );
}
