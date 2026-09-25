import Link from "next/link";
import { GoogleIntegrationPanel } from "@/components/google-integration-panel";
import { Suspense } from "react";

export default function IntegracoesPage() {
  return (
    <div>
      <p style={{ marginTop: 0 }}>
        <Link href="/cadastros">← Cadastros</Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Integrações</h1>
      <Suspense fallback={<p className="muted">Carregando…</p>}>
        <GoogleIntegrationPanel />
      </Suspense>
    </div>
  );
}
