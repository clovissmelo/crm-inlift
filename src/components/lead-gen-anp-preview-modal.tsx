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
  /** Ajusta a meta ao volume estimado e reabre a prévia. */
  onAdjustMetaToEstimated: (estimated: number) => void;
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
  onAdjustMetaToEstimated,
  starting
}: Props) {
  if (!open) return null;

  const unsupported = data?.supported === false;
  const cities = data?.cities ?? [];
  const estimatedNew = data?.new_estimated ?? 0;
  const belowRequested = Boolean(data && !unsupported && !loading && !error && estimatedNew < leadsRequested);

  return (
    <div className="lead-gen-overlay" role="dialog" aria-modal="true" aria-labelledby="lead-gen-anp-preview-title">
      <div className="lead-gen-overlay-backdrop" aria-hidden="true" onClick={onClose} />
      <div className="lead-gen-overlay-panel lead-gen-overlay-panel--wide">
        <header className="lead-gen-overlay-head">
          <div>
            <h2 id="lead-gen-anp-preview-title">Conferir antes de solicitar</h2>
            <p className="muted lead-gen-overlay-sub">
              Consulta a ANP antes de iniciar · meta de {leadsRequested} lead
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
            {belowRequested ? (
              <div className="lead-gen-preview-hint lead-gen-preview-hint--warn lead-gen-preview-adjust-prompt" role="status">
                <p style={{ margin: "0 0 0.35rem" }}>
                  A consulta encontrou <strong>{estimatedNew}</strong> CNPJ novo(s) estimado(s), abaixo dos{" "}
                  <strong>{leadsRequested}</strong> solicitados. Não dá para iniciar uma geração parcial com essa meta.
                </p>
                <p style={{ margin: 0 }}>
                  Deseja <strong>ajustar</strong> (ampliar cidades/zonas ou reduzir a meta) antes de continuar?
                </p>
              </div>
            ) : data.volume_hint ? (
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
          {belowRequested ? (
            <>
              <button type="button" className="btn btn-primary" onClick={onClose} disabled={starting}>
                Ajustar seleção
              </button>
              {estimatedNew > 0 ? (
                <button
                  type="button"
                  className="btn"
                  disabled={starting}
                  onClick={() => onAdjustMetaToEstimated(estimatedNew)}
                >
                  Usar meta de {estimatedNew} e conferir de novo
                </button>
              ) : null}
            </>
          ) : (
            <>
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
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
