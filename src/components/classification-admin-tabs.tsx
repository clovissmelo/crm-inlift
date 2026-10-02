"use client";

import { ResultadoComercialAdmin } from "@/components/resultado-comercial-admin";

export function ClassificationAdminTabs({ canDelete }: { canDelete?: boolean }) {
  return (
    <div>
      <ResultadoComercialAdmin canDelete={canDelete} commercialOnly />
    </div>
  );
}
