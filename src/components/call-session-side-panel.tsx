"use client";

import { Api4comCallResultForm } from "@/components/api4com-call-result-modal";
import { CallScriptGuidePanel, type ActiveCallForScript } from "@/components/call-script-guide-panel";
import { CallSidePanelShell } from "@/components/call-side-panel-shell";
import type { Product } from "@/lib/types";

export type CallSessionPanelMode = "script" | "result";

type Props = {
  mode: CallSessionPanelMode;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  activeCall: ActiveCallForScript | null;
  scriptBody: string | null;
  onLogUpdated: (log: import("@/lib/call-script-log").CallScriptLogEntry[]) => void;
  resultCallId: number | null;
  products: Product[];
  onResultClose: () => void;
  onResultCompleted: () => void;
};

export function CallSessionSidePanel({
  mode,
  collapsed,
  onCollapse,
  onExpand,
  activeCall,
  scriptBody,
  onLogUpdated,
  resultCallId,
  products,
  onResultClose,
  onResultCompleted
}: Props) {
  if (mode === "script" && activeCall) {
    return (
      <CallScriptGuidePanel
        call={activeCall}
        scriptBody={scriptBody}
        collapsed={collapsed}
        onCollapse={onCollapse}
        onExpand={onExpand}
        onLogUpdated={onLogUpdated}
      />
    );
  }

  if (mode === "result" && resultCallId != null) {
    return (
      <CallSidePanelShell
        title="COMPLEMENTO DE REGISTRO"
        ariaLabel="Complemento de registro da ligação"
        collapsed={collapsed}
        collapsedLabel="Complemento de registro"
        onCollapse={onCollapse}
        onExpand={onExpand}
      >
        <Api4comCallResultForm
          callId={resultCallId}
          active
          layout="panel"
          products={products}
          onClose={onResultClose}
          onCompleted={onResultCompleted}
        />
      </CallSidePanelShell>
    );
  }

  return null;
}
