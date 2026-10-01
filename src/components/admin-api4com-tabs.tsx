"use client";

import { useState } from "react";
import { AdminApi4comPanel } from "@/components/admin-api4com-panel";
import { DiscadorMappingAdmin } from "@/components/discador-mapping-admin";
import "@/components/result-association-admin.css";

export function AdminApi4comTabs() {
  const [tab, setTab] = useState<"integration" | "mapping">("integration");

  return (
    <div>
      <div className="classification-admin-tabs" style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn${tab === "integration" ? " btn-primary" : ""}`}
          onClick={() => setTab("integration")}
        >
          Integração
        </button>
        <button
          type="button"
          className={`btn${tab === "mapping" ? " btn-primary" : ""}`}
          onClick={() => setTab("mapping")}
        >
          Mapeamento do discador
        </button>
      </div>
      {tab === "integration" ? <AdminApi4comPanel /> : null}
      {tab === "mapping" ? <DiscadorMappingAdmin embedded /> : null}
    </div>
  );
}
