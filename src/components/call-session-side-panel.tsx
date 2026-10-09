"use client";

import { Api4comCallResultForm } from "@/components/api4com-call-result-modal";
import { Api4comWebphoneCompanionPanel } from "@/components/api4com-webphone-companion-panel";
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
  scriptReady?: boolean;
  onLogUpdated: (log: import("@/lib/call-script-log").CallScriptLogEntry[]) => void;
  resultCallId: number | null;
  products: Product[];
  onResultClose: () => void;
  onResultCompleted: () => void;
  onScriptFlowComplete?: () => void;
};

export function CallSessionSidePanel({
  mode,
  collapsed,
  onCollapse,
  onExpand,
  activeCall,
  scriptBody,
  scriptReady = true,
  onLogUpdated,
  resultCallId,
  products,
  onResultClose,
  onResultCompleted,
  onScriptFlowComplete
}: Props) {
  if (mode === "script" && activeCall) {
    const showCompanion = !collapsed && activeCall.status !== "completed" && activeCall.status !== "failed";
    return (
      <>
        {showCompanion ? (
          <Api4comWebphoneCompanionPanel callRecordId={activeCall.id} callStatus={activeCall.status} />
        ) : null}
        <CallScriptGuidePanel
          call={activeCall}
          scriptBody={scriptBody}
          scriptReady={scriptReady}
          collapsed={collapsed}
          onCollapse={onCollapse}
          onExpand={onExpand}
          onLogUpdated={onLogUpdated}
          onScriptFlowComplete={onScriptFlowComplete}
        />
      </>
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
