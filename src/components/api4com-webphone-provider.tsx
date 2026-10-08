"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { Api4comWebphoneDock } from "@/components/api4com-webphone-dock";
import { getLibwebphoneInstanceId, loadLibwebphoneScript } from "@/lib/api4com/load-libwebphone";
import type { User } from "@/lib/types";

export type WebphoneRegistrationState =
  | "idle"
  | "loading"
  | "connecting"
  | "registered"
  | "error"
  | "needs_config";

type WebphoneConfigResponse = {
  ok: boolean;
  missing: Array<"domain" | "extension" | "sip_password">;
  domain: string | null;
  extension: string | null;
  target_user_id: number;
  target_user_name: string | null;
  sip_password?: string;
  error?: string;
};

type EnsureOptions = {
  userId?: number;
  /** Abre o painel se ainda não estiver online */
  openPanel?: boolean;
};

type WebphoneContextValue = {
  status: WebphoneRegistrationState;
  isRegistered: boolean;
  registeredUserId: number | null;
  registeredExtension: string | null;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  ensureRegistered: (opts?: EnsureOptions) => Promise<boolean>;
  /** Registro SIP + refresh antes de POST /calls (API4COM exige ramal “online” no servidor). */
  prepareForApiDial: (opts?: EnsureOptions) => Promise<boolean>;
};

const WebphoneContext = createContext<WebphoneContextValue | null>(null);

export function useApi4comWebphone() {
  return useContext(WebphoneContext);
}

/** API4COM toca o ramal ao discar; o CRM precisa atender a perna SIP (libwebphone não expõe getCustomHeaders). */
function autoAnswerIncomingApiLeg(currentCall: LibWebphoneInstance) {
  if (!currentCall?.isPrimary?.()) {
    currentCall?.reject?.();
    return;
  }
  const direction = currentCall.getDirection?.();
  if (direction !== "terminating") return;

  const attemptAnswer = () => {
    if (currentCall.isEnded?.()) return;
    if (currentCall.isEstablished?.()) return;
    try {
      currentCall.answer?.();
    } catch {
      /* streams/mic podem falhar; tentamos de novo nos timeouts */
    }
  };

  attemptAnswer();
  for (const ms of [120, 400, 900, 1800]) {
    window.setTimeout(attemptAnswer, ms);
  }
}

function missingConfigMessage(missing: WebphoneConfigResponse["missing"]): string {
  const parts: string[] = [];
  if (missing.includes("domain")) parts.push("domínio SIP no Admin → API4COM");
  if (missing.includes("extension")) parts.push("ramal no perfil");
  if (missing.includes("sip_password")) parts.push("senha SIP no perfil");
  return `Falta configurar: ${parts.join(", ")}.`;
}

export function Api4comWebphoneProvider({
  user,
  canDial,
  children
}: {
  user: User;
  canDial: boolean;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<WebphoneRegistrationState>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [registeredUserId, setRegisteredUserId] = useState<number | null>(null);
  const [registeredExtension, setRegisteredExtension] = useState<string | null>(null);
  const [targetUserName, setTargetUserName] = useState<string | null>(null);

  const webphoneRef = useRef<LibWebphoneInstance | null>(null);
  const registeredRef = useRef(false);
  const waitersRef = useRef<Array<(ok: boolean) => void>>([]);

  const notifyRegistered = useCallback((ok: boolean) => {
    registeredRef.current = ok;
    waitersRef.current.splice(0).forEach((fn) => fn(ok));
  }, []);

  const teardownWebphone = useCallback(() => {
    const wp = webphoneRef.current;
    webphoneRef.current = null;
    registeredRef.current = false;
    setRegisteredUserId(null);
    setRegisteredExtension(null);
    if (wp?.getUserAgent?.()?.stop) {
      try {
        wp.getUserAgent().stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const bindWebphoneEvents = useCallback(
    (wp: LibWebphoneInstance) => {
      wp.on("userAgent.registration.registered", () => {
        setStatus("registered");
        setStatusDetail(null);
        notifyRegistered(true);
      });
      wp.on("userAgent.registration.failed", () => {
        setStatus("error");
        setStatusDetail("Registro SIP recusado. Confira ramal, senha e domínio.");
        notifyRegistered(false);
      });
      wp.on("userAgent.registration.unregistered", () => {
        if (registeredRef.current) {
          setStatus("idle");
          setStatusDetail("Ramal desconectado.");
        }
        notifyRegistered(false);
      });
      wp.on("userAgent.disconnected", () => {
        setStatus("error");
        setStatusDetail("Conexão WebSocket com a API4COM caiu.");
        notifyRegistered(false);
      });
      const onIncomingLeg = (_lwp: LibWebphoneInstance, currentCall: LibWebphoneInstance) => {
        autoAnswerIncomingApiLeg(currentCall);
      };
      wp.on("call.created", onIncomingLeg);
      wp.on("call.ringing.started", onIncomingLeg);
      wp.on("call.progress", onIncomingLeg);
    },
    [notifyRegistered]
  );

  const waitUntilRegistered = useCallback((timeoutMs: number) => {
    if (registeredRef.current) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        resolve(false);
      }, timeoutMs);
      waitersRef.current.push((ok) => {
        window.clearTimeout(timer);
        resolve(ok);
      });
    });
  }, []);

  const connectForUser = useCallback(
    async (targetUserId: number): Promise<boolean> => {
      if (!canDial) return false;
      setConnecting(true);
      setStatus("loading");
      setStatusDetail(null);

      try {
        const res = await fetch(
          `/api/api4com/webphone-config${targetUserId !== user.id ? `?user_id=${targetUserId}` : ""}`
        );
        const data = (await res.json()) as WebphoneConfigResponse;
        if (!res.ok) {
          setStatus("error");
          setStatusDetail(data.error ?? "Não foi possível carregar credenciais SIP.");
          return false;
        }

        setTargetUserName(data.target_user_name);

        if (!data.ok) {
          setStatus("needs_config");
          setStatusDetail(missingConfigMessage(data.missing));
          return false;
        }

        if (
          registeredRef.current &&
          registeredUserId === data.target_user_id &&
          registeredExtension === data.extension
        ) {
          setStatus("registered");
          return true;
        }

        teardownWebphone();
        setStatus("connecting");
        setRegisteredUserId(data.target_user_id);
        setRegisteredExtension(data.extension);

        await loadLibwebphoneScript();
        const domain = data.domain!;
        const wp = new window.libwebphone!({
          dialpad: { enabled: false },
          callList: { enabled: false },
          callControl: { enabled: false },
          videoCanvas: { enabled: false },
          mediaDevices: {
            enabled: true,
            videoinput: { enabled: false },
            renderTargets: ["api4com-wp-media"]
          },
          audioContext: {
            enabled: true,
            renderTargets: ["api4com-wp-audio"]
          },
          userAgent: {
            enabled: true,
            renderTargets: [],
            transport: {
              sockets: [`wss://${domain}:6443`],
              recovery_max_interval: 30,
              recovery_min_interval: 2
            },
            authentication: {
              username: data.extension!,
              password: data.sip_password!,
              realm: domain
            },
            user_agent: {
              instance_id: getLibwebphoneInstanceId(),
              no_answer_timeout: 30,
              register: true,
              register_expires: 600,
              user_agent: "inlift-crm-libwebphone"
            }
          }
        });

        webphoneRef.current = wp;
        bindWebphoneEvents(wp);

        const ua = wp.getUserAgent?.();
        ua?.start?.();

        const ok = await waitUntilRegistered(45000);
        if (!ok) {
          setStatus("error");
          setStatusDetail("Tempo esgotado aguardando registro SIP. Verifique credenciais e microfone.");
          notifyRegistered(false);
          return false;
        }
        return true;
      } catch (e) {
        setStatus("error");
        setStatusDetail(e instanceof Error ? e.message : "Erro ao conectar telefonia.");
        notifyRegistered(false);
        return false;
      } finally {
        setConnecting(false);
      }
    },
    [
      bindWebphoneEvents,
      canDial,
      notifyRegistered,
      registeredExtension,
      registeredUserId,
      teardownWebphone,
      user.id,
      waitUntilRegistered
    ]
  );

  const ensureRegistered = useCallback(
    async (opts?: EnsureOptions) => {
      const targetUserId = opts?.userId ?? user.id;
      const shouldOpen = opts?.openPanel !== false;
      if (shouldOpen) setPanelOpen(true);

      if (registeredRef.current && registeredUserId === targetUserId) {
        return true;
      }

      return connectForUser(targetUserId);
    },
    [connectForUser, registeredUserId, user.id]
  );

  const prepareForApiDial = useCallback(
    async (opts?: EnsureOptions) => {
      const ok = await ensureRegistered({ ...opts, openPanel: opts?.openPanel ?? false });
      if (!ok) return false;
      const wp = webphoneRef.current;
      try {
        wp?.getUserAgent?.()?.register?.();
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 1200));
      return registeredRef.current;
    },
    [ensureRegistered]
  );

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  useEffect(() => {
    return () => {
      teardownWebphone();
    };
  }, [teardownWebphone]);

  const value: WebphoneContextValue = {
    status,
    isRegistered: status === "registered",
    registeredUserId,
    registeredExtension,
    panelOpen,
    openPanel,
    closePanel,
    ensureRegistered,
    prepareForApiDial
  };

  if (!canDial) {
    return <>{children}</>;
  }

  return (
    <WebphoneContext.Provider value={value}>
      {children}
      <Api4comWebphoneDock
        open={panelOpen}
        onClose={closePanel}
        status={status}
        statusDetail={statusDetail}
        extension={registeredExtension}
        targetUserName={targetUserName}
        connecting={connecting}
        onConnect={() => void connectForUser(registeredUserId ?? user.id)}
      />
    </WebphoneContext.Provider>
  );
}
