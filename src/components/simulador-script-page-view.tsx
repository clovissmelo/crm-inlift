"use client";

import { useRouter } from "next/navigation";
import { ResultadoComercialSimulatorPanel } from "@/components/resultado-comercial-simulator-panel";

export function SimuladorScriptPageView() {
  const router = useRouter();

  return (
    <div className="simulador-script-page">
      <ResultadoComercialSimulatorPanel
        open
        embedded
        onClose={() => router.push("/dashboard")}
      />
    </div>
  );
}
