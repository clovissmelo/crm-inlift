"use client";

import { useEffect, useRef } from "react";

/** Intervalo padrão da “fonte da verdade” (com motor ativo usa intervalo menor). */
export const NOVOS_LEADS_PAGE_SYNC_MS = 4_000;
export const NOVOS_LEADS_PAGE_SYNC_MOTOR_MS = 2_500;

const FETCH_INIT: RequestInit = {
  cache: "no-store",
  headers: {
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  }
};

let abortActivePageSync: (() => void) | null = null;

/** Cancela fetch de sync em andamento (ex.: ao clicar no menu lateral). */
export function abortNovosLeadsPageSync() {
  abortActivePageSync?.();
}

export type NovosLeadsPageSyncPayload = {
  server_time: string;
  runs: unknown[];
  quota: unknown;
  watch: {
    run: unknown;
    activity?: unknown[];
    phase_line?: string | null;
  } | null;
};

type Options = {
  enabled: boolean;
  watchRunId: number | null;
  withFeed: boolean;
  /** Avança a execução no servidor (drain) antes de devolver o estado. */
  advanceMotor?: boolean;
  intervalMs?: number;
  onPayload: (payload: NovosLeadsPageSyncPayload) => void;
  onError?: () => void;
};

/**
 * Polling leve e previsível: uma rota só, sem cache, reagendado após cada resposta
 * (não empilha requests se a rede/Vercel demorar).
 */
export function useNovosLeadsPageSync({
  enabled,
  watchRunId,
  withFeed,
  advanceMotor = false,
  intervalMs = NOVOS_LEADS_PAGE_SYNC_MS,
  onPayload,
  onError
}: Options) {
  const onPayloadRef = useRef(onPayload);
  onPayloadRef.current = onPayload;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: number | undefined;
    let syncController: AbortController | null = null;

    abortActivePageSync = () => syncController?.abort();

    async function runSync() {
      if (cancelled) return;
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }
      syncController?.abort();
      const controller = new AbortController();
      syncController = controller;
      try {
        const params = new URLSearchParams();
        if (watchRunId != null && watchRunId > 0) params.set("watch", String(watchRunId));
        if (withFeed) params.set("feed", "1");
        if (advanceMotor) params.set("motor", "1");
        params.set("t", String(Date.now()));
        const res = await fetch(`/api/admin/lead-generation/page-sync?${params}`, {
          ...FETCH_INIT,
          signal: controller.signal
        });
        if (!res.ok) {
          onErrorRef.current?.();
          return;
        }
        const data = (await res.json()) as NovosLeadsPageSyncPayload;
        if (!cancelled) onPayloadRef.current(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        onErrorRef.current?.();
      } finally {
        if (syncController === controller) syncController = null;
        schedule();
      }
    }

    function schedule() {
      if (cancelled) return;
      timer = window.setTimeout(() => void runSync(), intervalMs);
    }

    void runSync();

    function onVisibility() {
      if (document.visibilityState === "visible") void runSync();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      abortActivePageSync = null;
      syncController?.abort();
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, watchRunId, withFeed, advanceMotor, intervalMs]);
}
