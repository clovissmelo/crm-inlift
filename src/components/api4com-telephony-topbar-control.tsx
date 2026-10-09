"use client";

import clsx from "clsx";
import { Phone } from "lucide-react";
import { useApi4comSession, useApi4comWebphone } from "@/components/api4com-call-provider";

export function Api4comTelephonyTopbarControl() {
  const session = useApi4comSession();
  const webphone = useApi4comWebphone();

  if (!session?.telephonyConfigured || !webphone) return null;

  const wp = webphone;
  const online = wp.isRegistered;
  const busy = wp.status === "connecting" || wp.status === "loading";
  const offline = !online;

  return (
    <button
      type="button"
      className={clsx(
        "api4com-telephony-topbar-btn",
        online && "api4com-telephony-topbar-btn--online",
        busy && "api4com-telephony-topbar-btn--busy",
        offline && !busy && "api4com-telephony-topbar-btn--offline"
      )}
      onClick={() => wp.openPanel()}
      aria-label={
        online
          ? "Ramal online — abrir discador"
          : busy
            ? "Telefonia conectando — abrir discador"
            : "Telefonia desconectada — abrir discador para conectar"
      }
      title={online ? "Ramal online — abrir discador" : busy ? "Conectando ramal…" : "Ramal desconectado — clique para conectar"}
    >
      <Phone size={18} aria-hidden className="api4com-telephony-topbar-icon" />
      {offline && !busy ? <span className="api4com-telephony-topbar-strike" aria-hidden /> : null}
    </button>
  );
}
