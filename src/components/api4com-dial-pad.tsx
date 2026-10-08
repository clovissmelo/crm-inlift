"use client";

import clsx from "clsx";
import { Delete, Mic, MicOff, Phone } from "lucide-react";
import { useState } from "react";

const DIAL_ROWS: { digit: string; sub?: string }[][] = [
  [
    { digit: "1" },
    { digit: "2", sub: "ABC" },
    { digit: "3", sub: "DEF" }
  ],
  [
    { digit: "4", sub: "GHI" },
    { digit: "5", sub: "JKL" },
    { digit: "6", sub: "MNO" }
  ],
  [
    { digit: "7", sub: "PQRS" },
    { digit: "8", sub: "TUV" },
    { digit: "9", sub: "WXYZ" }
  ],
  [{ digit: "*" }, { digit: "0", sub: "+" }, { digit: "#" }]
];

/** Dígitos para exibição — ligações nacionais (sem prefixo 55 no visor). */
function nationalDigitsForDisplay(raw: string): string {
  let digits = raw.replace(/[^\d+#*]/g, "");
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

function formatDialDisplay(raw: string): string {
  const digits = nationalDigitsForDisplay(raw);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}${digits.slice(11)}`;
}

export function Api4comDialPad({
  value,
  onChange,
  onDial,
  dialing,
  disabled,
  isMuted,
  onToggleMute,
  showHangUp,
  onHangUp,
  hangingUp
}: {
  value: string;
  onChange: (next: string) => void;
  onDial: () => void;
  dialing: boolean;
  disabled?: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  showHangUp: boolean;
  onHangUp: () => void;
  hangingUp: boolean;
}) {
  const [showPad, setShowPad] = useState(true);
  const busy = disabled || dialing || hangingUp;
  const readout = formatDialDisplay(value);

  function append(digit: string) {
    if (busy) return;
    onChange(value + digit);
  }

  function backspace() {
    if (busy || !value) return;
    onChange(value.slice(0, -1));
  }

  return (
    <div className="api4com-dial-pad">
      <p className="api4com-dial-pad-readout" aria-live="polite">
        {readout || <span className="muted">Digite o número</span>}
      </p>
      <div className="api4com-dial-pad-display-wrap">
        <input
          id="api4com-manual-dial-input"
          type="tel"
          className="api4com-dial-pad-display input"
          placeholder="(51) 99999-9999"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
          autoComplete="tel"
          aria-label="Número para ligação"
        />
      </div>

      <div className="api4com-dial-pad-mode">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPad((v) => !v)}>
          {showPad ? "Ocultar teclado" : "Mostrar teclado"}
        </button>
      </div>

      {showPad ? (
        <div className="api4com-dial-pad-grid" role="group" aria-label="Teclado numérico">
          {DIAL_ROWS.flatMap((row) =>
            row.map(({ digit, sub }) => (
              <button
                key={digit}
                type="button"
                className="api4com-dial-pad-key"
                disabled={busy}
                onClick={() => append(digit)}
              >
                <span className="api4com-dial-pad-key-digit">{digit}</span>
                {sub ? <span className="api4com-dial-pad-key-sub">{sub}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}

      <div className="api4com-dial-pad-actions">
        <button
          type="button"
          className={clsx("api4com-dial-pad-action-btn", isMuted && "api4com-dial-pad-action-btn--active")}
          disabled={busy}
          onClick={onToggleMute}
          aria-pressed={isMuted}
          aria-label={isMuted ? "Ativar microfone" : "Mutar microfone"}
          title={isMuted ? "Ativar microfone" : "Mutar microfone"}
        >
          {isMuted ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}
          <span className="api4com-dial-pad-action-label">{isMuted ? "Ativar" : "Mudo"}</span>
        </button>
        <button type="button" className="api4com-dial-pad-action-btn" disabled={busy || !value.trim()} onClick={backspace} aria-label="Apagar dígito">
          <Delete size={20} aria-hidden />
        </button>
        <button
          type="button"
          className="api4com-dial-pad-call-btn"
          disabled={busy || !value.trim()}
          onClick={onDial}
        >
          <Phone size={22} aria-hidden />
          {dialing ? "Discando…" : "Ligar"}
        </button>
      </div>

      {showHangUp ? (
        <button type="button" className="btn btn-danger btn-block api4com-webphone-hangup-btn" disabled={hangingUp} onClick={onHangUp}>
          {hangingUp ? "Desligando…" : "Desligar ligação"}
        </button>
      ) : null}
    </div>
  );
}
