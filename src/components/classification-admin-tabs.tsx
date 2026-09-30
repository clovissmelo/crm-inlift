"use client";

import { useState } from "react";
import { ResultadoComercialAdmin } from "@/components/resultado-comercial-admin";
import { TechnicalResultAdmin } from "@/components/technical-result-admin";
import { ContactOutcomeAdmin } from "@/components/contact-outcome-admin";

export function ClassificationAdminTabs({ canDelete }: { canDelete?: boolean }) {
  const [tab, setTab] = useState<"technical" | "contact" | "commercial">("commercial");

  return (
    <div>
      <div className="classification-admin-tabs" style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        <button type="button" className={`btn${tab === "technical" ? " btn-primary" : ""}`} onClick={() => setTab("technical")}>
          Resultado da ligação
        </button>
        <button type="button" className={`btn${tab === "contact" ? " btn-primary" : ""}`} onClick={() => setTab("contact")}>
          Contato realizado
        </button>
        <button type="button" className={`btn${tab === "commercial" ? " btn-primary" : ""}`} onClick={() => setTab("commercial")}>
          Resultado comercial
        </button>
      </div>
      {tab === "technical" ? <TechnicalResultAdmin /> : null}
      {tab === "contact" ? <ContactOutcomeAdmin /> : null}
      {tab === "commercial" ? <ResultadoComercialAdmin canDelete={canDelete} commercialOnly /> : null}
    </div>
  );
}
