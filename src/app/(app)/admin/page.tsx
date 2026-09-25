import Link from "next/link";

export default function AdminHubPage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Admin</h1>
      <p className="muted">Configurações avançadas, integrações e descoberta de leads.</p>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 480 }}>
        <Link className="btn" href="/admin/variaveis">
          Variáveis para as APIs
        </Link>
        <Link className="btn" href="/admin/novos-leads">
          Novos leads
        </Link>
      </div>
    </div>
  );
}
