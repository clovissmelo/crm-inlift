"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Api4comCallResultModal } from "@/components/api4com-call-result-modal";
import { CallScriptGuidePanel, type ActiveCallForScript } from "@/components/call-script-guide-panel";
import { isStructuredCallScriptBody } from "@/lib/call-script-log";
import type { Product, User } from "@/lib/types";

function pickCallScriptBody(
  items: Array<{ body: string; script_type: string; product_id: number | null }>,
  productId: number | null
) {
  const callScripts = items.filter((s) => s.script_type === "call" && s.body?.trim());
  const pool = productId
    ? callScripts.filter((s) => s.product_id === productId || s.product_id == null)
    : callScripts;
  const withFlow = pool.filter((s) => isStructuredCallScriptBody(s.body));
  if (productId != null) {
    const exactFlow = withFlow.find((s) => s.product_id === productId);
    if (exactFlow) return exactFlow.body;
    const exact = pool.find((s) => s.product_id === productId);
    if (exact) return exact.body;
  }
  return withFlow[0]?.body ?? pool[0]?.body ?? null;
}

function isProspeccaoPath(pathname: string | null) {
  return pathname?.startsWith("/prospeccao") ?? false;
}

type PendingCall = {
  id: number;
  client_id: number | null;
  result_deferred_at: string | null;
  client_name: string | null;
  phone_dialed: string;
  ended_at: string | null;
};

type Api4comSession = {
  canDial: boolean;
};

const Api4comContext = createContext<Api4comSession | null>(null);

export function useApi4comSession() {
  return useContext(Api4comContext);
}

export function Api4comCallProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const onProspeccaoPage = isProspeccaoPath(pathname);
  const canDial = user.roles.includes("bdr");
  const [products, setProducts] = useState<Product[]>([]);
  const [pending, setPending] = useState<PendingCall[]>([]);
  const [modalCallId, setModalCallId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const autoOpenedRef = useRef<Set<number>>(new Set());

  const [activeCall, setActiveCall] = useState<ActiveCallForScript | null>(null);
  const [callScriptBody, setCallScriptBody] = useState<string | null>(null);
  const [scriptPanelCollapsed, setScriptPanelCollapsed] = useState(false);

  const refreshPending = useCallback(async () => {
    if (!canDial) return;
    const res = await fetch("/api/api4com/calls/pending");
    if (!res.ok) return;
    const data = (await res.json()) as { items: PendingCall[] };
    setPending(data.items ?? []);
  }, [canDial]);

  const refreshActiveCall = useCallback(async () => {
    if (!canDial) {
      setActiveCall(null);
      return;
    }
    const res = await fetch("/api/api4com/calls/active");
    if (!res.ok) return;
    const data = (await res.json()) as { items: ActiveCallForScript[] };
    const next = data.items?.[0] ?? null;
    setActiveCall(next);
    if (!next) setCallScriptBody(null);
  }, [canDial]);

  useEffect(() => {
    if (!canDial) return;
    void fetch("/api/products")
      .then((r) => r.json())
      .then((d: { products?: Product[] }) => setProducts(d.products ?? []))
      .catch(() => null);
  }, [canDial]);

  useEffect(() => {
    if (!canDial) return;
    void refreshPending();
    const t = window.setInterval(() => void refreshPending(), 4000);
    return () => window.clearInterval(t);
  }, [canDial, refreshPending]);

  useEffect(() => {
    if (!canDial) return;
    void refreshActiveCall();
    const t = window.setInterval(() => void refreshActiveCall(), 1500);
    return () => window.clearInterval(t);
  }, [canDial, refreshActiveCall]);

  useEffect(() => {
    if (!activeCall) {
      setCallScriptBody(null);
      return;
    }
    setScriptPanelCollapsed(false);
    const params = new URLSearchParams({ type: "call" });
    if (activeCall.product_id) params.set("product_id", String(activeCall.product_id));
    void fetch(`/api/message-scripts?${params}`)
      .then((r) => r.json())
      .then((d: { items?: Array<{ body: string; script_type: string; product_id: number | null }> }) => {
        setCallScriptBody(pickCallScriptBody(d.items ?? [], activeCall.product_id));
      })
      .catch(() => setCallScriptBody(null));
  }, [activeCall?.id, activeCall?.product_id]);

  useEffect(() => {
    if (activeCall) setScriptPanelCollapsed(false);
  }, [activeCall?.id]);

  useEffect(() => {
    if (!canDial || !onProspeccaoPage || modalOpen) return;
    for (const call of pending) {
      if (autoOpenedRef.current.has(call.id)) continue;
      autoOpenedRef.current.add(call.id);
      setModalCallId(call.id);
      setModalOpen(true);
      break;
    }
  }, [pending, canDial, modalOpen, onProspeccaoPage]);

  useEffect(() => {
    if (onProspeccaoPage || !modalOpen) return;
    if (modalCallId != null) autoOpenedRef.current.add(modalCallId);
    setModalOpen(false);
    setModalCallId(null);
  }, [onProspeccaoPage, modalOpen, modalCallId]);

  const pendingCount = pending.length;
  const showProspeccaoRegisterUi = canDial && onProspeccaoPage;
  const showBanner = showProspeccaoRegisterUi && pendingCount > 0 && !modalOpen;

  function openNextPending() {
    const next = pending[0];
    if (!next) return;
    setModalCallId(next.id);
    setModalOpen(true);
  }

  function closeModal() {
    if (modalCallId != null) autoOpenedRef.current.add(modalCallId);
    setModalOpen(false);
    setModalCallId(null);
    void refreshPending();
  }

  const showScriptPanel = canDial && activeCall != null && !modalOpen;

  return (
    <Api4comContext.Provider value={{ canDial }}>
      {showBanner ? (
        <div
          className="alert alert-info"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            margin: 0,
            borderRadius: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <span>
            {pendingCount === 1
              ? "1 ligação sem resultado registrado. O lead continua na prospecção até você salvar."
              : `${pendingCount} ligações sem resultado registrado. Os leads continuam na prospecção até você salvar.`}
          </span>
          <button type="button" className="btn btn-primary" onClick={openNextPending}>
            Registrar agora
          </button>
        </div>
      ) : null}
      {children}
      {showScriptPanel ? (
        <CallScriptGuidePanel
          call={activeCall}
          scriptBody={callScriptBody}
          collapsed={scriptPanelCollapsed}
          onCollapse={() => setScriptPanelCollapsed(true)}
          onExpand={() => setScriptPanelCollapsed(false)}
          onLogUpdated={(log) => setActiveCall((c) => (c ? { ...c, script_flow_log: log } : c))}
        />
      ) : null}
      {showProspeccaoRegisterUi ? (
        <Api4comCallResultModal
          callId={modalCallId}
          open={modalOpen}
          products={products}
          onClose={closeModal}
          onCompleted={() => void refreshPending()}
        />
      ) : null}
    </Api4comContext.Provider>
  );
}
