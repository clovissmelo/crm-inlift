"use client";

import clsx from "clsx";
import { Phone, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApi4comSession, useApi4comWebphone } from "@/components/api4com-call-provider";

export function Api4comTelephonyTopbarControl() {
  const session = useApi4comSession();
  const webphone = useApi4comWebphone();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (!session?.telephonyConfigured || !webphone) return null;

  const wp = webphone;
  const online = wp.isRegistered;
  const busy = wp.status === "connecting" || wp.status === "loading";
  const offline = !online;

  function onTriggerClick() {
    if (online) {
      setMenuOpen((v) => !v);
      return;
    }
    setMenuOpen(false);
    wp.openPanel();
  }

  return (
    <div className="api4com-telephony-topbar-menu" ref={ref}>
      <button
        type="button"
        className={clsx(
          "api4com-telephony-topbar-btn",
          online && "api4com-telephony-topbar-btn--online",
          busy && "api4com-telephony-topbar-btn--busy",
          offline && !busy && "api4com-telephony-topbar-btn--offline"
        )}
        onClick={onTriggerClick}
        aria-expanded={online ? menuOpen : undefined}
        aria-haspopup={online ? "menu" : undefined}
        aria-label={
          online
            ? "Telefonia conectada — opções do ramal"
            : busy
              ? "Telefonia conectando — abrir discador"
              : "Telefonia desconectada — abrir discador para conectar"
        }
        title={online ? "Ramal online — clique para opções" : busy ? "Conectando ramal…" : "Ramal desconectado — clique para conectar"}
      >
        <Phone size={18} aria-hidden className="api4com-telephony-topbar-icon" />
        {offline && !busy ? <span className="api4com-telephony-topbar-strike" aria-hidden /> : null}
      </button>
      {menuOpen && online ? (
        <div className="api4com-telephony-topbar-panel" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              wp.openPanel();
            }}
          >
            Abrir discador
          </button>
          <button
            type="button"
            role="menuitem"
            className="api4com-telephony-topbar-panel-danger"
            onClick={() => {
              setMenuOpen(false);
              void wp.disconnectRamal();
            }}
          >
            <PhoneOff size={16} aria-hidden />
            Desconectar ramal
          </button>
        </div>
      ) : null}
    </div>
  );
}
