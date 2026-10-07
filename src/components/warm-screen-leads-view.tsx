"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Play, Pause, Square, Radio, List } from "lucide-react";
import { ProspeccaoPriorityBadge } from "@/components/prospeccao-priority-badge";
import { CadastroModal } from "@/components/cadastro-ui";
import { FilterBar, FilterInput, FilterSelect } from "@/components/filter-bar";
import { PageIntro } from "@/components/page-intro";
import { normalizeApi4comExtension } from "@/lib/api4com/phone";
import type { Company, Product, User } from "@/lib/types";
import type { ProspeccaoListItem } from "@/lib/prospeccao-query";

type Tab = "lista" | "tempo_real" | "execucoes";

type Execution = {
  id: number;
  status: string;
  items_total: number;
  items_done: number;
  items_warmed: number;
  items_skipped: number;
  items_error: number;
  started_at: string;
  finished_at: string | null;
  last_error: string | null;
};

type ExecutionItem = {
  id: number;
  client_id: number;
  status: string;
  phone_dialed: string | null;
  skip_reason: string | null;
};

export function WarmScreenLeadsView({
  initialItems,
  initialTotal,
  products,
  bdrs,
  companies,
  priorityFilters,
  defaultBdrUserId = null,
  isAdmin = false
}: {
  initialItems: ProspeccaoListItem[];
  initialTotal: number;
  products: Product[];
  bdrs: User[];
  companies: Company[];
  priorityFilters: Array<{ slug: string; name: string }>;
  defaultBdrUserId?: number | null;
  isAdmin?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("lista");
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeExecution, setActiveExecution] = useState<Execution | null>(null);
  const [activeItems, setActiveItems] = useState<ExecutionItem[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [dialAsUserId, setDialAsUserId] = useState("");
  const [ramalModalOpen, setRamalModalOpen] = useState(false);

  const bdrsWithRamal = bdrs.filter((b) => Boolean(normalizeApi4comExtension(b.api4com_extension ?? "")));

  const [filters, setFilters] = useState({
    product_id: "",
    bdr_user_id: defaultBdrUserId != null ? String(defaultBdrUserId) : "",
    prioridade: "primeiro_contato",
    company_id: "",
    search: ""
  });
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const loadList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    const res = await fetch(`/api/warm-screen/queue?${params}`);
    const data = (await res.json()) as { items: ProspeccaoListItem[]; total: number };
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [filters, offset]);

  const loadExecutions = useCallback(async () => {
    const res = await fetch("/api/warm-screen/executions?limit=40");
    if (!res.ok) return;
    const data = (await res.json()) as { items: Execution[] };
    setExecutions(data.items ?? []);
  }, []);

  const pollActive = useCallback(async () => {
    const res = await fetch("/api/warm-screen/executions/active?tick=1");
    if (!res.ok) return;
    const data = (await res.json()) as { execution: Execution | null; items: ExecutionItem[] };
    setActiveExecution(data.execution);
    setActiveItems(data.items ?? []);
    if (data.execution?.status === "completed") {
      void loadList();
      void loadExecutions();
    }
  }, [loadExecutions, loadList]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void fetch("/api/warm-screen/executions/active")
      .then((r) => r.json())
      .then((d: { execution: Execution | null }) => setActiveExecution(d.execution))
      .catch(() => null);
  }, []);

  useEffect(() => {
    setOffset(0);
  }, [filters]);

  useEffect(() => {
    if (tab === "execucoes") void loadExecutions();
  }, [tab, loadExecutions]);

  useEffect(() => {
    if (tab !== "tempo_real") return;
    void pollActive();
    const t = window.setInterval(() => void pollActive(), 2000);
    return () => window.clearInterval(t);
  }, [tab, pollActive]);

  function updateFilter(patch: Partial<typeof filters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  function productLabels(productIds: number[]) {
    const names = productIds.map((id) => productNameById.get(id)).filter(Boolean) as string[];
    return names.length ? names.join(", ") : "—";
  }

  function openRamalModalOrStart() {
    if (isAdmin) {
      if (bdrsWithRamal.length === 0) {
        setMessage("Nenhuma BDR com ramal cadastrado. Configure em Usuários antes de aquecer.");
        return;
      }
      setDialAsUserId((prev) => prev || String(bdrsWithRamal[0]!.id));
      setRamalModalOpen(true);
      return;
    }
    void startWarm();
  }

  async function startWarm() {
    setStarting(true);
    setMessage(null);
    setRamalModalOpen(false);
    const body: Record<string, unknown> = {
      filters: {
        prioridade: filters.prioridade || undefined,
        product_id: filters.product_id ? Number(filters.product_id) : undefined,
        company_id: filters.company_id ? Number(filters.company_id) : undefined,
        bdr_user_id: filters.bdr_user_id ? Number(filters.bdr_user_id) : undefined,
        search: filters.search || undefined
      }
    };
    if (isAdmin) {
      if (!dialAsUserId) {
        setStarting(false);
        setMessage("Selecione por qual ramal deseja rodar o aquecimento.");
        setRamalModalOpen(true);
        return;
      }
      body.dial_as_user_id = Number(dialAsUserId);
    }
    const res = await fetch("/api/warm-screen/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = (await res.json()) as { execution?: Execution; error?: string };
    setStarting(false);
    if (!res.ok) {
      setMessage(data.error ?? "Erro ao iniciar");
      return;
    }
    setActiveExecution(data.execution ?? null);
    setMessage("Motor iniciado.");
    setTab("tempo_real");
    void loadExecutions();
  }

  async function execAction(id: number, action: "pause" | "resume" | "stop") {
    const res = await fetch(`/api/warm-screen/executions/${id}/${action}`, { method: "POST" });
    const data = (await res.json()) as { execution?: Execution; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Erro");
      return;
    }
    if (data.execution) setActiveExecution(data.execution);
    void loadExecutions();
    void pollActive();
  }

  const statusLabel: Record<string, string> = {
    running: "Em andamento",
    paused: "Pausada",
    stopped: "Interrompida",
    completed: "Concluída",
    failed: "Falhou"
  };

  return (
    <div>
      <PageIntro>Motor de aquecimento de leads — triagem automática (1 tentativa por lead).</PageIntro>

      <div className="filter-bar" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button type="button" className={tab === "lista" ? "btn btn-primary" : "btn"} onClick={() => setTab("lista")}>
          <List size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Lista
        </button>
        <button type="button" className={tab === "tempo_real" ? "btn btn-primary" : "btn"} onClick={() => setTab("tempo_real")}>
          <Radio size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Em tempo real
        </button>
        <button type="button" className={tab === "execucoes" ? "btn btn-primary" : "btn"} onClick={() => setTab("execucoes")}>
          Execuções
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={
            starting ||
            activeExecution?.status === "running" ||
            activeExecution?.status === "paused"
          }
          onClick={() => openRamalModalOrStart()}
        >
          <Play size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
          {starting ? "Iniciando…" : "Aquecer leads"}
        </button>
      </div>

      <CadastroModal
        open={ramalModalOpen}
        title="Ramal do aquecimento"
        onClose={() => {
          if (!starting) setRamalModalOpen(false);
        }}
      >
        <p className="muted" style={{ marginTop: 0 }}>
          Escolha a BDR cujo ramal e token API4COM serão usados para discar nesta execução.
        </p>
        <label className="filter-chip" style={{ display: "block", marginBottom: "1rem" }}>
          <span className="filter-chip-label">Rodar como</span>
          <select
            className="input"
            value={dialAsUserId}
            onChange={(e) => setDialAsUserId(e.target.value)}
            disabled={starting}
          >
            <option value="">Selecione…</option>
            {bdrsWithRamal.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — ramal {normalizeApi4comExtension(b.api4com_extension ?? "")}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" className="btn" disabled={starting} onClick={() => setRamalModalOpen(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={starting || !dialAsUserId}
            onClick={() => void startWarm()}
          >
            {starting ? "Iniciando…" : "Iniciar aquecimento"}
          </button>
        </div>
      </CadastroModal>

      {message ? <p className="muted">{message}</p> : null}

      {tab === "lista" ? (
        <>
          <FilterBar>
            <FilterInput
              label="Busca"
              className="filter-chip-grow"
              value={filters.search}
              onChange={(e) => updateFilter({ search: e.target.value })}
              placeholder="Nome, CNPJ…"
            />
            <FilterSelect label="Prioridade" value={filters.prioridade} onChange={(e) => updateFilter({ prioridade: e.target.value })}>
              <option value="">Todas</option>
              {priorityFilters.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Empresa" value={filters.company_id} onChange={(e) => updateFilter({ company_id: e.target.value })}>
              <option value="">Todas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Produto" value={filters.product_id} onChange={(e) => updateFilter({ product_id: e.target.value })}>
              <option value="">Todos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="BDR" value={filters.bdr_user_id} onChange={(e) => updateFilter({ bdr_user_id: e.target.value })}>
              <option value="">Todas</option>
              {bdrs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </FilterSelect>
          </FilterBar>

          <div className="panel table-wrap">
            {loading ? <p className="muted">Carregando…</p> : null}
            <table className="data-table">
              <thead>
                <tr>
                  <th>Prioridade</th>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Produto</th>
                  <th>Cidade</th>
                  <th>UF</th>
                  <th>Telefones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const displayName = item.trade_name || item.legal_name || `#${item.id}`;
                  return (
                    <tr key={item.id}>
                      <td>
                        <ProspeccaoPriorityBadge
                          label={item.queue_label}
                          color={item.queue_color}
                          overdueAlert={item.queue_overdue_alert}
                        />
                      </td>
                      <td>
                        <Link href={`/clientes/${item.id}`}>{displayName}</Link>
                      </td>
                      <td>{item.cnpj ?? "—"}</td>
                      <td>{productLabels(item.product_ids)}</td>
                      <td>{item.city ?? "—"}</td>
                      <td>{item.uf ?? "—"}</td>
                      <td className="muted">{item.contact_phone_count > 0 ? item.contact_phone_count : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">{total} registro(s)</p>
        </>
      ) : null}

      {tab === "tempo_real" ? (
        <div className="panel">
          {activeExecution ? (
            <>
              <p>
                Execução #{activeExecution.id} · {statusLabel[activeExecution.status] ?? activeExecution.status}
              </p>
              <p className="muted">
                {activeExecution.items_done}/{activeExecution.items_total} processados · {activeExecution.items_warmed} aquecidos ·{" "}
                {activeExecution.items_error} erro · {activeExecution.items_skipped} pulados
              </p>
              {activeExecution.last_error ? <p className="alert alert-warning">{activeExecution.last_error}</p> : null}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                {activeExecution.status === "running" ? (
                  <button type="button" className="btn" onClick={() => void execAction(activeExecution.id, "pause")}>
                    <Pause size={14} /> Pausar
                  </button>
                ) : null}
                {activeExecution.status === "paused" ? (
                  <button type="button" className="btn btn-primary" onClick={() => void execAction(activeExecution.id, "resume")}>
                    <Play size={14} /> Retomar
                  </button>
                ) : null}
                {activeExecution.status === "running" || activeExecution.status === "paused" ? (
                  <button type="button" className="btn" onClick={() => void execAction(activeExecution.id, "stop")}>
                    <Square size={14} /> Parar
                  </button>
                ) : null}
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Telefone</th>
                  </tr>
                </thead>
                <tbody>
                  {activeItems
                    .filter((i) => i.status === "dialing" || i.status === "pending")
                    .slice(0, 8)
                    .map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link href={`/clientes/${i.client_id}`}>#{i.client_id}</Link>
                        </td>
                        <td>{i.status}</td>
                        <td>{i.phone_dialed ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">Nenhuma execução em andamento. Use &quot;Aquecer leads&quot; na aba Lista.</p>
          )}
        </div>
      ) : null}

      {tab === "execucoes" ? (
        <div className="panel table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
                <th>Início</th>
                <th>Progresso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((ex) => (
                <tr key={ex.id}>
                  <td>{ex.id}</td>
                  <td>{statusLabel[ex.status] ?? ex.status}</td>
                  <td>{new Date(ex.started_at).toLocaleString("pt-BR")}</td>
                  <td>
                    {ex.items_done}/{ex.items_total} · {ex.items_warmed} aquecidos
                  </td>
                  <td style={{ display: "flex", gap: 4 }}>
                    {ex.status === "running" ? (
                      <button type="button" className="btn btn-sm" onClick={() => void execAction(ex.id, "pause")}>
                        Pausar
                      </button>
                    ) : null}
                    {ex.status === "paused" ? (
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => void execAction(ex.id, "resume")}>
                        Play
                      </button>
                    ) : null}
                    {ex.status === "running" || ex.status === "paused" ? (
                      <button type="button" className="btn btn-sm" onClick={() => void execAction(ex.id, "stop")}>
                        Stop
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
