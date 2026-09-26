"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Api4comCallResultModal } from "@/components/api4com-call-result-modal";
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
  const [modalCallId, setModalCallId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const autoOpenedRef = useRef<Set<number>>(new Set());

  const refreshPending = useCallback(async () => {
    if (!canDial) return;
    const res = await fetch("/api/api4com/calls/pending");
    if (!res.ok) return;
    const data = (await res.json()) as { items: PendingCall[] };
    setPending(data.items ?? []);
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
