"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CallSessionSidePanel, type CallSessionPanelMode } from "@/components/call-session-side-panel";
import { type ActiveCallForScript } from "@/components/call-script-guide-panel";
import { tryAutoRegisterApi4comCall } from "@/lib/api4com/auto-register-call";
import { pickCallScriptBody } from "@/lib/pick-call-script";
import type { Product, User } from "@/lib/types";

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
  const autoOpenedRef = useRef<Set<number>>(new Set());

  const [activeCall, setActiveCall] = useState<ActiveCallForScript | null>(null);
  const [callScriptBody, setCallScriptBody] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [resultCallId, setResultCallId] = useState<number | null>(null);

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
    setResultCallId(null);
    setPanelCollapsed(false);
    const params = new URLSearchParams({ type: "call" });
    if (activeCall.product_id) params.set("product_id", String(activeCall.product_id));
    void fetch(`/api/message-scripts?${params}`)
      .then((r) => r.json())
      .then(
        (d: {
          items?: Array<{ body: string; script_type: string; product_id: number | null; updated_at?: string }>;
        }) => {
          setCallScriptBody(pickCallScriptBody(d.items ?? [], activeCall.product_id));
        }
      )
      .catch(() => setCallScriptBody(null));
  }, [activeCall?.id, activeCall?.product_id]);

  useEffect(() => {
    if (!canDial || !onProspeccaoPage || activeCall) return;
    for (const call of pending) {
      if (autoOpenedRef.current.has(call.id)) continue;
      autoOpenedRef.current.add(call.id);
      void (async () => {
        const autoDone = await tryAutoRegisterApi4comCall(call.id);
        if (autoDone) {
          void refreshPending();
          return;
        }
        setResultCallId(call.id);
        setPanelCollapsed(false);
      })();
      break;
    }
  }, [pending, canDial, onProspeccaoPage, activeCall, refreshPending]);

  useEffect(() => {
    if (onProspeccaoPage) return;
    setResultCallId(null);
  }, [onProspeccaoPage]);

  useEffect(() => {
    if (resultCallId != null && !pending.some((p) => p.id === resultCallId)) {
      setResultCallId(null);
    }
  }, [pending, resultCallId]);

  const panelMode: CallSessionPanelMode | null = activeCall ? "script" : resultCallId != null ? "result" : null;
  const showSidePanel = canDial && panelMode != null && (panelMode === "script" || onProspeccaoPage);

  function closeResultPanel() {
    if (resultCallId != null) autoOpenedRef.current.add(resultCallId);
    setResultCallId(null);
    void refreshPending();
  }

  const pendingCount = pending.length;
  const showPendingHint =
    canDial && onProspeccaoPage && pendingCount > 0 && panelMode !== "result" && !activeCall;

  return (
    <Api4comContext.Provider value={{ canDial }}>
      {showPendingHint ? (
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
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const next = pending[0];
              if (!next) return;
              setResultCallId(next.id);
              setPanelCollapsed(false);
            }}
          >
            Registrar agora
          </button>
        </div>
      ) : null}
      {children}
      {showSidePanel && panelMode ? (
        <CallSessionSidePanel
          mode={panelMode}
          collapsed={panelCollapsed}
          onCollapse={() => setPanelCollapsed(true)}
          onExpand={() => setPanelCollapsed(false)}
          activeCall={activeCall}
          scriptBody={callScriptBody}
          onLogUpdated={(log) => setActiveCall((c) => (c ? { ...c, script_flow_log: log } : c))}
          resultCallId={resultCallId}
          products={products}
          onResultClose={closeResultPanel}
          onResultCompleted={() => void refreshPending()}
        />
      ) : null}
    </Api4comContext.Provider>
  );
}
