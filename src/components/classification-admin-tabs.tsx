"use client";

import { useState } from "react";
import { DiscadorMappingAdmin } from "@/components/discador-mapping-admin";
import { ResultAssociationMatrixAdmin } from "@/components/result-association-matrix-admin";
import { ResultadoComercialAdmin } from "@/components/resultado-comercial-admin";
import "@/components/result-association-admin.css";

export function ClassificationAdminTabs({ canDelete }: { canDelete?: boolean }) {
  const [tab, setTab] = useState<"matrix" | "discador" | "commercial">("matrix");

  return (
    <div>
      <div className="classification-admin-tabs" style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        <button type="button" className={`btn${tab === "matrix" ? " btn-primary" : ""}`} onClick={() => setTab("matrix")}>
          Matriz de associações
        </button>
        <button type="button" className={`btn${tab === "discador" ? " btn-primary" : ""}`} onClick={() => setTab("discador")}>
          Mapeamento do discador
        </button>
        <button type="button" className={`btn${tab === "commercial" ? " btn-primary" : ""}`} onClick={() => setTab("commercial")}>
          Catálogo comercial
        </button>
      </div>
      {tab === "matrix" ? <ResultAssociationMatrixAdmin /> : null}
      {tab === "discador" ? <DiscadorMappingAdmin /> : null}
      {tab === "commercial" ? <ResultadoComercialAdmin canDelete={canDelete} commercialOnly /> : null}
    </div>
  );
}
