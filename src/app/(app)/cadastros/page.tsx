import Link from "next/link";

export default function CadastrosPage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Cadastros</h1>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 420 }}>
        <Link className="btn" href="/cadastros/usuarios">
          Usuários
        </Link>
        <Link className="btn" href="/cadastros/produtos">
          Produtos
        </Link>
        <Link className="btn" href="/cadastros/importacao">
          Importação de planilhas
        </Link>
        <Link className="btn" href="/cadastros/integracoes">
          Integrações (Google Agenda)
        </Link>
        <Link className="btn" href="/clientes/novo">
          Novo cliente
        </Link>
      </div>
    </div>
  );
}
