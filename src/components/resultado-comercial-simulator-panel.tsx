"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Api4comCallResultForm,
  type CallRegistrationSimulation
} from "@/components/api4com-call-result-modal";
import { CallScriptGuidePanel, type ActiveCallForScript } from "@/components/call-script-guide-panel";
import { CallSidePanelShell } from "@/components/call-side-panel-shell";
import { callRequiresComplementRegistration } from "@/lib/api4com/call-registration";
import type { TechnicalResultTypeRow } from "@/lib/classifications/technical-result-match";
import { pickCallScriptBody } from "@/lib/pick-call-script";
import type { Product } from "@/lib/types";
import "./resultado-comercial-admin.css";

type Phase = "setup" | "script" | "register";

function telephonyScenario(tech: TechnicalResultTypeRow) {
  const now = new Date().toISOString();
  const answered = callRequiresComplementRegistration({
    technical_slug: tech.slug,
    answered_at: tech.slug === "answered" ? now : null,
    duration_seconds: tech.slug === "answered" ? 36 : 0
  });
  return {
    technicalSlug: tech.slug,
    technicalDisplayName: tech.display_name,
    answeredAt: answered ? now : null,
    durationSeconds: answered ? 36 : 0
  };
}

export function ResultadoComercialSimulatorPanel({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
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

  const reset = useCallback(() => {
    setPhase("setup");
    setCollapsed(false);
    setRunId(0);
    setSkipScript(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/approach-classifications").then((r) => r.json())
    ]).then(([pData, cData]) => {
      const items = (pData as { items?: Product[] }).items ?? [];
      setProducts(items);
      setProductId((prev) => prev || (items[0] ? String(items[0].id) : ""));
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setScriptReady(false);
    const pid = productId ? Number(productId) : null;
    const params = new URLSearchParams({ type: "call" });
    if (pid) params.set("product_id", String(pid));
    void fetch(`/api/message-scripts?${params}`)
      .then((r) => r.json())
      .then((d: { items?: Parameters<typeof pickCallScriptBody>[0] }) => {
        setScriptBody(pickCallScriptBody(d.items ?? [], pid));
      })
      .catch(() => setScriptBody(null))
      .finally(() => setScriptReady(true));
  }, [open, productId]);

  const selectedTech = useMemo(
    () => technicalTypes.find((t) => t.slug === technicalSlug),
    [technicalTypes, technicalSlug]
  );

  const simulationConfig = useMemo((): CallRegistrationSimulation | null => {
    if (phase !== "register" || !selectedTech) return null;
    const pid = productId ? Number(productId) : undefined;
    return {
      telephony: telephonyScenario(selectedTech),
      productId: pid && Number.isFinite(pid) ? pid : undefined
    };
  }, [phase, selectedTech, productId]);

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
      status: "in_progress"
    };
  }, [phase, products, productId]);

  function startSimulation(goRegisterOnly = false) {
    if (!selectedTech) return;
    setRunId((n) => n + 1);
    const answered = callRequiresComplementRegistration({
      technical_slug: selectedTech.slug,
      answered_at: selectedTech.slug === "answered" ? new Date().toISOString() : null,
      duration_seconds: selectedTech.slug === "answered" ? 36 : 0
    });
    if (!goRegisterOnly && !skipScript && answered && scriptBody?.trim() && scriptReady) {
      setPhase("script");
      setCollapsed(false);
      return;
    }
    setPhase("register");
    setCollapsed(false);
  }

  if (!open) return null;

  if (phase === "script" && mockScriptCall) {
    return (
      <CallScriptGuidePanel
        call={mockScriptCall}
        scriptBody={scriptBody}
        scriptReady={scriptReady}
        collapsed={collapsed}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
        onScriptFlowComplete={() => {
          setRunId((n) => n + 1);
          setPhase("register");
        }}
      />
    );
  }

  if (phase === "register" && simulationConfig) {
    return (
      <CallSidePanelShell
        title="COMPLEMENTO DE REGISTRO"
        meta="Simulador — mesmo fluxo da ligação real"
        ariaLabel="Simulador de complemento de registro"
        collapsed={collapsed}
        collapsedLabel="Simulador"
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
      >
        <div className="resultado-simulator-back">
          <button type="button" className="btn btn-sm" onClick={() => setPhase("setup")}>
            ← Ajustar cenário
          </button>
        </div>
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

  return (
    <CallSidePanelShell
      title="Simulador de ligação"
      meta="Teste abordagem, resultados comerciais e regras — nada é gravado"
      ariaLabel="Simulador de ligação e registro"
      collapsed={collapsed}
      collapsedLabel="Simulador"
      onCollapse={() => setCollapsed(true)}
      onExpand={() => setCollapsed(false)}
      footer={
        <div className="resultado-simulator-setup-actions">
          <button type="button" className="btn" onClick={onClose}>
            Fechar
          </button>
          {scriptBody && !skipScript ? (
            <button
              type="button"
              className="btn"
              disabled={!selectedTech || !scriptReady}
              onClick={() => startSimulation(true)}
            >
              Só complemento
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedTech || (!scriptReady && !skipScript)}
            onClick={() => startSimulation(false)}
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
        <label className="label">Produto (abordagem)</label>
        <select
          className="select"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
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
        <label className="label">Resultado da ligação (telefonia)</label>
        <select
          className="select"
          value={technicalSlug}
          onChange={(e) => setTechnicalSlug(e.target.value)}
        >
          {technicalTypes.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.display_name}
            </option>
          ))}
        </select>
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
