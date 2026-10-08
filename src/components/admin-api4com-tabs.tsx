"use client";

import { useState } from "react";
import { AdminApi4comPanel, type AdminApi4comSection } from "@/components/admin-api4com-panel";
import { DiscadorMappingAdmin } from "@/components/discador-mapping-admin";
import "@/components/result-association-admin.css";

const TAB_ITEMS: { id: AdminApi4comSection | "mapping"; label: string }[] = [
  { id: "checklist", label: "Checklist" },
  { id: "credentials", label: "Credenciais" },
  { id: "extensions", label: "Ramais e SIP" },
  { id: "webhook", label: "Webhook" },
  { id: "mapping", label: "Mapeamento do discador" }
];

export function AdminApi4comTabs() {
  const [tab, setTab] = useState<AdminApi4comSection | "mapping">("checklist");

  return (
    <div>
      <div
        className="classification-admin-tabs"
        role="tablist"
        aria-label="Configuração API4COM"
        style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}
      >
        {TAB_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`btn${tab === item.id ? " btn-primary" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "mapping" ? <DiscadorMappingAdmin embedded /> : <AdminApi4comPanel section={tab} />}
    </div>
  );
}
