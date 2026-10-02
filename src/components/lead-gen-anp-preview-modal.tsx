"use client";

import "./lead-gen-execution.css";
import { X } from "lucide-react";

export type AnpPreviewPayload = {
  supported: boolean;
  initial_source?: string;
  message?: string;
  segment?: string;
  max_stations?: number;
  volume_ok?: boolean;
  volume_hint?: string;
  cities?: Array<{ city: string; postos: number; error: string | null }>;
  total_postos?: number;
  unique_cnpjs?: number;
  existing_in_crm?: number;
  new_estimated?: number;
  cities_scanned?: number;
  cities_total?: number;
  truncated?: boolean;
  error?: string;
};

type Props = {
  open: boolean;
  loading: boolean;
  data: AnpPreviewPayload | null;
  error: string | null;
  leadsRequested: number;
  onClose: () => void;
  onConfirmStart: () => void;
  starting: boolean;
};

export function LeadGenAnpPreviewModal({
  open,
  loading,
  data,
  error,
  leadsRequested,
  onClose,
  onConfirmStart,
  starting
}: Props) {
  if (!open) return null;

  const unsupported = data?.supported === false;
  const cities = data?.cities ?? [];

  return (
    <div className="lead-gen-overlay" role="dialog" aria-modal="true" aria-labelledby="lead-gen-anp-preview-title">
      <div className="lead-gen-overlay-backdrop" aria-hidden="true" onClick={onClose} />
      <div className="lead-gen-overlay-panel lead-gen-overlay-panel--wide">
        <header className="lead-gen-overlay-head">
          <div>
            <h2 id="lead-gen-anp-preview-title">Volume na ANP por cidade</h2>
            <p className="muted lead-gen-overlay-sub">
              Consulta a API pública antes de iniciar a geração · meta {leadsRequested} lead
              {leadsRequested === 1 ? "" : "s"} novo{leadsRequested === 1 ? "" : "s"}
            </p>
          </div>
          <button type="button" className="btn btn-icon-sm lead-gen-overlay-close" aria-label="Fechar" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {loading ? (
          <p className="muted">Consultando municípios na ANP… (pode levar até 1 minuto)</p>
        ) : error ? (
          <p className="alert alert-error">{error}</p>
        ) : unsupported ? (
          <p className="muted">{data?.message ?? "Prévia ANP não disponível para este fluxo."}</p>
        ) : data ? (
          <>
            <ul className="lead-gen-overlay-stats muted">
              <li>Postos (segmento): {data.total_postos ?? 0}</li>
              <li>CNPJs únicos: {data.unique_cnpjs ?? 0}</li>
              <li>Já no CRM: {data.existing_in_crm ?? 0}</li>
              <li>Novos estimados: {data.new_estimated ?? 0}</li>
            </ul>
            {data.volume_hint ? (
              <p className={data.volume_ok ? "lead-gen-preview-hint lead-gen-preview-hint--ok" : "lead-gen-preview-hint lead-gen-preview-hint--warn"}>
                {data.volume_hint}
              </p>
            ) : null}
            {data.truncated ? (
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                Mostrando {data.cities_scanned} de {data.cities_total} cidades (limite da prévia).
              </p>
            ) : null}
            <div className="lead-gen-preview-table-wrap">
              <table className="lead-gen-preview-table">
                <thead>
                  <tr>
                    <th>Cidade</th>
                    <th>Postos</th>
                  </tr>
                </thead>
                <tbody>
                  {cities.map((row) => (
                    <tr key={row.city}>
                      <td>{row.city}</td>
                      <td>
                        {row.error ? (
                          <span className="muted" title={row.error}>
                            0 (erro)
                          </span>
                        ) : (
                          row.postos
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <footer className="lead-gen-overlay-actions">
          <button type="button" className="btn" onClick={onClose} disabled={starting}>
            Voltar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || starting || Boolean(error && !unsupported)}
            onClick={onConfirmStart}
          >
            {starting ? "Iniciando…" : unsupported ? "Iniciar geração" : "Confirmar e iniciar geração"}
          </button>
        </footer>
      </div>
    </div>
  );
}
