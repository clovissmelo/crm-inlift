"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { WarmScreenPromptCell } from "@/components/warm-screen-prompt-cell";
import {
  formatWarmScreenResultSummary,
  warmScreenProgressDetail,
  warmScreenProgressPct,
  WARM_SCREEN_ITEM_STATUS_LABEL
} from "@/lib/warm-screen/execution-outcome";
import type { Company, Product, User } from "@/lib/types";

type ExecutionDetail = {
  id: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  items_total: number;
  items_done: number;
  items_warmed: number;
  items_skipped: number;
  items_error: number;
  last_error: string | null;
  filters_json: unknown;
  runner_user_id: number;
  dial_user_id: number;
};

type ItemDetail = {
  id: number;
  client_id: number;
  status: string;
  phone_dialed: string | null;
  skip_reason: string | null;
  error_message: string | null;
  completed_at: string | null;
  prompt?: {
    lines: Array<{ text: string; variant?: "dim" | "warn" | "err" | "ok" }>;
    live: boolean;
  };
};

const STATUS_LABEL: Record<string, string> = {
  running: "Em andamento",
  paused: "Pausada",
  stopped: "Interrompida",
  completed: "Concluída",
  failed: "Falhou"
};

function normalizeFilters(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function filterLines(
  filters: Record<string, unknown> | null,
  ctx: {
    bdrNameById: Map<number, string>;
    companyNameById: Map<number, string>;
    productNameById: Map<number, string>;
    priorityLabelBySlug: Map<string, string>;
  }
): string[] {
  if (!filters) return ["Sem filtros"];
  const lines: string[] = [];
  const pri = filters.prioridade;
  if (typeof pri === "string" && pri) {
    lines.push(`Prioridade: ${ctx.priorityLabelBySlug.get(pri) ?? pri}`);
  }
  const bdr = filters.bdr_user_id;
  if (typeof bdr === "number") {
    lines.push(`BDR: ${ctx.bdrNameById.get(bdr) ?? `#${bdr}`}`);
  }
  const company = filters.company_id;
  if (typeof company === "number") {
    lines.push(`Empresa: ${ctx.companyNameById.get(company) ?? `#${company}`}`);
  }
  const product = filters.product_id;
  if (typeof product === "number") {
    lines.push(`Produto: ${ctx.productNameById.get(product) ?? `#${product}`}`);
  }
  const search = filters.search;
  if (typeof search === "string" && search.trim()) {
    lines.push(`Busca: ${search.trim()}`);
  }
  return lines.length ? lines : ["Fila padrão do aquecedor"];
}

export function WarmScreenExecutionDetailModal({
  executionId,
  open,
  onClose,
  bdrs,
  companies,
  products,
  priorityFilters
}: {
  executionId: number | null;
  open: boolean;
  onClose: () => void;
  bdrs: User[];
  companies: Company[];
  products: Product[];
  priorityFilters: Array<{ slug: string; name: string }>;
}) {
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [items, setItems] = useState<ItemDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const bdrNameById = new Map(bdrs.map((b) => [b.id, b.name]));
  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
  const productNameById = new Map(products.map((p) => [p.id, p.name]));
  const priorityLabelBySlug = new Map(priorityFilters.map((p) => [p.slug, p.name]));

  const load = useCallback(async () => {
    if (!executionId) return;
    setLoading(true);
    const res = await fetch(`/api/warm-screen/executions/${executionId}`, { cache: "no-store" });
    setLoading(false);
    if (!res.ok) return;
    const data = (await res.json()) as { execution: ExecutionDetail; items: ItemDetail[] };
    setExecution(data.execution);
    setItems(data.items ?? []);
  }, [executionId]);

  useEffect(() => {
    if (!open || !executionId) return;
    void load();
  }, [open, executionId, load]);

  useEffect(() => {
    if (!open || !executionId || !execution) return;
    if (execution.status !== "running" && execution.status !== "paused") return;
    const t = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(t);
  }, [open, executionId, execution?.status, load, execution]);

  const pct = execution ? warmScreenProgressPct(execution) : 0;

  return (
    <CadastroModal
      open={open}
      title={execution ? `Execução #${execution.id}` : "Detalhes da execução"}
      onClose={onClose}
      wide
    >
      {loading && !execution ? <p className="muted">Carregando…</p> : null}
      {execution ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            {STATUS_LABEL[execution.status] ?? execution.status} · Início{" "}
            {new Date(execution.started_at).toLocaleString("pt-BR")}
            {execution.finished_at
              ? ` · Fim ${new Date(execution.finished_at).toLocaleString("pt-BR")}`
              : null}
          </p>
          <p>
            <strong>Resultado:</strong> {formatWarmScreenResultSummary(execution)}
          </p>
          <div className="lead-gen-progress lead-gen-progress--overlay" style={{ marginTop: "0.75rem" }}>
            <div className="lead-gen-progress-head">
              <span className="lead-gen-progress-pct">{pct}%</span>
              <span className="lead-gen-progress-detail muted">{warmScreenProgressDetail(execution)}</span>
            </div>
            <div
              className="lead-gen-progress-track"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="lead-gen-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {execution.last_error ? <p className="alert alert-warning">{execution.last_error}</p> : null}
          <div style={{ marginTop: "1rem" }}>
            <p className="label">Parâmetros</p>
            <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {filterLines(normalizeFilters(execution.filters_json), {
                bdrNameById,
                companyNameById,
                productNameById,
                priorityLabelBySlug
              }).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="muted" style={{ marginBottom: 0 }}>
              Ramal: {bdrNameById.get(execution.dial_user_id) ?? `#${execution.dial_user_id}`}
              {execution.dial_user_id !== execution.runner_user_id
                ? ` · Operador: ${bdrNameById.get(execution.runner_user_id) ?? `#${execution.runner_user_id}`}`
                : null}
            </p>
          </div>
          <div className="table-wrap" style={{ marginTop: "1rem", maxHeight: "22rem", overflow: "auto" }}>
            <table className="data-table warm-screen-realtime-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Telefone</th>
                  <th>Prompt</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/clientes/${item.client_id}`}>#{item.client_id}</Link>
                    </td>
                    <td title={item.skip_reason ?? item.error_message ?? undefined}>
                      {WARM_SCREEN_ITEM_STATUS_LABEL[item.status] ?? item.status}
                    </td>
                    <td>{item.phone_dialed ?? "—"}</td>
                    <td>
                      {item.prompt ? (
                        <WarmScreenPromptCell prompt={item.prompt} />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </CadastroModal>
  );
}
