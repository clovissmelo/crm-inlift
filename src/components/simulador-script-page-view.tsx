"use client";

import { useRouter } from "next/navigation";
import { ResultadoComercialSimulatorPanel } from "@/components/resultado-comercial-simulator-panel";

export function SimuladorScriptPageView() {
  const router = useRouter();

  return (
    <div className="simulador-script-page">
      <div className="simulador-script-page-main">
        <h2 className="simulador-script-page-title">Simulador de script</h2>
        <p className="muted simulador-script-page-lead">
          Na prospecção real, a fila de leads ocupa esta área e o roteiro abre no painel lateral — igual à ligação
          ativa. Use o painel à direita para escolher produto, resultado da ligação e iniciar a simulação.
        </p>
      </div>
      <ResultadoComercialSimulatorPanel
        open
        embedded={false}
        onClose={() => router.push("/dashboard")}
      />
    </div>
  );
}
