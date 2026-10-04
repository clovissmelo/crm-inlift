"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Api4comCallResultForm,
  type CallRegistrationSimulation,
  type SimulatedClientTimelineItem
} from "@/components/api4com-call-result-modal";
import { formatSpDateTime } from "@/lib/datetime";
import { CallScriptGuidePanel, type ActiveCallForScript } from "@/components/call-script-guide-panel";
import { CallSidePanelShell } from "@/components/call-side-panel-shell";
import {
  callRequiresComplementRegistration,
  callTelephonyResultLabel
} from "@/lib/api4com/call-registration";
import type { TechnicalResultTypeRow } from "@/lib/classifications/technical-result-match";
import { normalizeCallScriptBodyForSave } from "@/lib/script-flow";
import { pickCallScriptBody } from "@/lib/pick-call-script";
import { technicalResultIconForSlug } from "@/lib/technical-result-icons";
import type { CallScriptLogEntry } from "@/lib/call-script-log";
import type { Product } from "@/lib/types";
import "./resultado-comercial-admin.css";

type Phase = "setup" | "script" | "register" | "history";

function telephonyScenario(tech: TechnicalResultTypeRow) {
  const now = new Date().toISOString();
  const answered = callRequiresComplementRegistration({
    technical_slug: tech.slug,
    answered_at: tech.slug === "answered" ? now : null,
    duration_seconds: tech.slug === "answered" ? 36 : 0
  });
  return {
    technicalSlug: tech.slug,
    technicalDisplayName: callTelephonyResultLabel(tech.slug, tech.display_name),
    answeredAt: answered ? now : null,
    durationSeconds: answered ? 36 : 0
  };
}

export type SimulatorDraftScript = {
  body: string;
  productId: number | null;
};

export function ResultadoComercialSimulatorPanel({
  open,
  onClose,
  draftScript = null,
  embedded = false
}: {
  open: boolean;
  onClose: () => void;
  /** Roteiro ainda não salvo (ex.: editor em Abordagens). */
  draftScript?: SimulatorDraftScript | null;
  /** Coluna fixa ao lado do editor (sem overlay sobre o modal). */
  embedded?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [products, setProducts] = useState<Product[]>([]);
  const [technicalTypes, setTechnicalTypes] = useState<TechnicalResultTypeRow[]>([]);
  const [productId, setProductId] = useState("");
  const [technicalSlug, setTechnicalSlug] = useState("answered");
  const [scriptBody, setScriptBody] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [runId, setRunId] = useState(0);
  const [skipScript, setSkipScript] = useState(false);
  const [scriptLog, setScriptLog] = useState<CallScriptLogEntry[]>([]);
  const [historyPreview, setHistoryPreview] = useState<SimulatedClientTimelineItem | null>(null);
  const draftLaunchKeyRef = useRef<string | null>(null);

  const handleRegistrationComplete = useCallback((item: SimulatedClientTimelineItem) => {
    setHistoryPreview(item);
    setPhase("history");
    setCollapsed(false);
  }, []);

  const reset = useCallback(() => {
    setPhase("setup");
    setCollapsed(false);
    setRunId(0);
    setSkipScript(false);
    setScriptLog([]);
    setHistoryPreview(null);
  }, []);

  useEffect(() => {
    if (!open) {
      draftLaunchKeyRef.current = null;
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      fetch("/api/products", { credentials: "same-origin" }).then((r) => r.json()),
      fetch("/api/approach-classifications", { credentials: "same-origin" }).then((r) => r.json())
    ]).then(([pData, cData]) => {
      const items = (pData as { products?: Product[] }).products ?? [];
      setProducts(items);
      setProductId((prev) => {
        if (draftScript?.productId != null && items.some((p) => p.id === draftScript.productId)) {
          return String(draftScript.productId);
        }
        if (prev && items.some((p) => String(p.id) === prev)) return prev;
        return items[0] ? String(items[0].id) : "";
      });
      const tech = (cData as { technical?: TechnicalResultTypeRow[] }).technical ?? [];
      setTechnicalTypes(tech);
      if (tech.length > 0) {
        setTechnicalSlug((prev) =>
          tech.some((t) => t.slug === prev)
            ? prev
            : (tech.find((t) => t.slug === "answered")?.slug ?? tech[0]!.slug)
        );
      }
    });
  }, [open, draftScript?.productId]);

  useEffect(() => {
    if (!open) return;
    if (draftScript?.body?.trim()) {
      setScriptBody(normalizeCallScriptBodyForSave(draftScript.body));
      if (draftScript.productId != null) setProductId(String(draftScript.productId));
      setScriptReady(true);
      return;
    }
    setScriptReady(false);
    const pid = productId ? Number(productId) : null;
    const params = new URLSearchParams({ type: "call" });
    if (pid) params.set("product_id", String(pid));
    void fetch(`/api/message-scripts?${params}`)
      .then((r) => r.json())
      .then((d: { items?: Parameters<typeof pickCallScriptBody>[0] }) => {
        const raw = pickCallScriptBody(d.items ?? [], pid);
        setScriptBody(raw ? normalizeCallScriptBodyForSave(raw) : null);
      })
      .catch(() => setScriptBody(null))
      .finally(() => setScriptReady(true));
  }, [open, productId, draftScript?.body, draftScript?.productId]);

  useEffect(() => {
    if (!open || !draftScript?.body?.trim() || !scriptReady) return;
    if (technicalTypes.length === 0) return;
    const launchKey = `${draftScript.body.length}:${draftScript.productId ?? ""}`;
    if (draftLaunchKeyRef.current === launchKey) return;
    draftLaunchKeyRef.current = launchKey;
    setTechnicalSlug((prev) =>
      technicalTypes.some((t) => t.slug === "answered") ? "answered" : prev
    );
    setScriptLog([]);
    setRunId((n) => n + 1);
    setPhase("script");
    setCollapsed(false);
  }, [open, draftScript?.body, draftScript?.productId, scriptReady, technicalTypes.length]);

  const selectedTech = useMemo(
    () => technicalTypes.find((t) => t.slug === technicalSlug),
    [technicalTypes, technicalSlug]
  );

  const simulationConfig = useMemo((): CallRegistrationSimulation | null => {
    if (phase !== "register" || !selectedTech) return null;
    const pid = productId ? Number(productId) : undefined;
    return {
      telephony: telephonyScenario(selectedTech),
      productId: pid && Number.isFinite(pid) ? pid : undefined,
      scriptFlowLog: scriptLog,
      onRegistrationComplete: handleRegistrationComplete
    };
  }, [phase, selectedTech, productId, scriptLog, handleRegistrationComplete]);

  const mockScriptCall = useMemo((): ActiveCallForScript | null => {
    if (phase !== "script") return null;
    const prod = products.find((p) => String(p.id) === productId);
    return {
      id: -1,
      client_id: 1,
      product_id: prod?.id ?? null,
      client_name: "Empresa Exemplo Ltda",
      product_name: prod?.name ?? null,
      contact_name: "Clóvis Melo",
      user_name: "Simulação",
      status: "in_progress",
      script_flow_log: scriptLog
    };
  }, [phase, products, productId, scriptLog]);

  function goToCommercialRegistration() {
    if (!selectedTech) return;
    setRunId((n) => n + 1);
    setPhase("register");
    setCollapsed(false);
  }

  function startSimulation() {
    if (!selectedTech) return;
    setScriptLog([]);
    setRunId((n) => n + 1);
    const answered = callRequiresComplementRegistration({
      technical_slug: selectedTech.slug,
      answered_at: selectedTech.slug === "answered" ? new Date().toISOString() : null,
      duration_seconds: selectedTech.slug === "answered" ? 36 : 0
    });
    if (!skipScript && answered && scriptBody?.trim() && scriptReady) {
      setPhase("script");
      setCollapsed(false);
      return;
    }
    setPhase("register");
    setCollapsed(false);
  }

  if (!open) return null;

  const wrapEmbedded = (node: ReactNode) =>
    embedded ? <div className="resultado-simulator-embedded-root">{node}</div> : node;

  if (phase === "script" && mockScriptCall) {
    return wrapEmbedded(
      <CallScriptGuidePanel
        key={`sim-script-${runId}`}
        call={mockScriptCall}
        scriptBody={scriptBody}
        scriptReady={scriptReady}
        collapsed={collapsed}
        embedded={embedded}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
        onLogUpdated={setScriptLog}
        onScriptFlowComplete={goToCommercialRegistration}
        onCloseSimulator={onClose}
      />
    );
  }

  if (phase === "history" && historyPreview) {
    return wrapEmbedded(
      <CallSidePanelShell
        title="HISTÓRICO DO CLIENTE"
        meta="Simulação — como ficaria após salvar o atendimento"
        ariaLabel="Prévia do histórico do cliente"
        collapsed={collapsed}
        embedded={embedded}
        collapsedLabel="Simulador"
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
        footer={
          <div className="resultado-simulator-setup-actions">
            <button type="button" className="btn" onClick={onClose}>
              Fechar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setHistoryPreview(null);
                setPhase("setup");
              }}
            >
              Nova simulação
            </button>
          </div>
        }
      >
        <p className="muted" style={{ marginTop: 0, fontSize: "0.8125rem" }}>
          Nada foi gravado no banco. Abaixo, o mesmo formato do histórico na ficha do cliente.
        </p>
        <ul className="sim-client-timeline-preview">
          <li className="sim-client-timeline-preview-item">
            <div className="sim-client-timeline-preview-meta">
              {formatSpDateTime(historyPreview.occurred_at)}
              {historyPreview.user_name ? ` · ${historyPreview.user_name}` : ""}
            </div>
            <strong>{historyPreview.title}</strong>
            {historyPreview.detail ? <div className="muted">{historyPreview.detail}</div> : null}
            {historyPreview.script_detail ? (
              <div className="muted sim-client-timeline-preview-script">{historyPreview.script_detail}</div>
            ) : null}
          </li>
        </ul>
      </CallSidePanelShell>
    );
  }

  if (phase === "register" && simulationConfig) {
    return wrapEmbedded(
      <CallSidePanelShell
        title="COMPLEMENTO DE REGISTRO"
        meta="Simulador — registro comercial (última etapa)"
        ariaLabel="Simulador de complemento de registro"
        collapsed={collapsed}
        embedded={embedded}
        collapsedLabel="Simulador"
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
        headerActions={
          <button type="button" className="btn btn-sm" onClick={() => setPhase("setup")}>
            Ajustar cenário
          </button>
        }
      >
        <Api4comCallResultForm
          key={runId}
          callId={null}
          active
          layout="panel"
          products={products}
          simulation={simulationConfig}
          onClose={onClose}
          onCompleted={() => {}}
        />
      </CallSidePanelShell>
    );
  }

  return wrapEmbedded(
    <CallSidePanelShell
      title="Simulador de ligação"
      meta="Teste abordagem, resultados comerciais e regras — nada é gravado"
      ariaLabel="Simulador de ligação e registro"
      collapsed={collapsed}
      embedded={embedded}
      collapsedLabel="Simulador"
      onCollapse={() => setCollapsed(true)}
      onExpand={() => setCollapsed(false)}
      footer={
        <div className="resultado-simulator-setup-actions">
          <button type="button" className="btn" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedTech || !productId || (!scriptReady && !skipScript && Boolean(scriptBody))}
            onClick={() => startSimulation()}
          >
            Iniciar simulação
          </button>
        </div>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: "0.8125rem" }}>
        Escolha o produto (roteiro de abordagem) e o resultado técnico da ligação. Se atender, o fluxo segue como na
        prospecção: roteiro no painel e depois complemento de registro.
      </p>

      <div className="field">
        <label className="label">Produto</label>
        <select
          className="select"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          disabled={products.length === 0}
        >
          {products.length === 0 ? (
            <option value="">Nenhum produto cadastrado</option>
          ) : (
            products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </select>
        {!scriptReady ? (
          <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
            Carregando roteiro…
          </p>
        ) : scriptBody ? (
          <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
            Roteiro de ligação encontrado para este produto.
          </p>
        ) : (
          <p className="muted" style={{ fontSize: "0.75rem", margin: "6px 0 0" }}>
            Sem roteiro — a simulação vai direto ao complemento de registro.
          </p>
        )}
      </div>

      <div className="field">
        <span className="label">Resultado da ligação (telefonia)</span>
        <div className="resultado-simulator-tech-picker" role="group" aria-label="Resultado da ligação">
          {technicalTypes.map((t) => {
            const active = technicalSlug === t.slug;
            const Icon = technicalResultIconForSlug(t.slug);
            return (
              <button
                key={t.slug}
                type="button"
                className={clsx("resultado-simulator-tech-btn", active && "is-active")}
                aria-pressed={active}
                onClick={() => setTechnicalSlug(t.slug)}
              >
                <Icon size={18} strokeWidth={2} aria-hidden className="resultado-simulator-tech-btn-icon" />
                <span>{callTelephonyResultLabel(t.slug, t.display_name)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {scriptBody ? (
        <label className="resultado-check-row" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={skipScript}
            onChange={(e) => setSkipScript(e.target.checked)}
          />
          <span>Pular roteiro e ir direto ao complemento</span>
        </label>
      ) : null}
    </CallSidePanelShell>
  );
}
