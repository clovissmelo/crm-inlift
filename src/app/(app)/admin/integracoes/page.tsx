import { AdminApi4comPanel } from "@/components/admin-api4com-panel";
import { PageIntro } from "@/components/page-intro";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";

export default async function AdminIntegracoesPage() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/dashboard");

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <PageIntro>
        Telefonia e conectores externos. Credenciais ficam no servidor (variáveis de ambiente ou cadastro admin), nunca no navegador.
      </PageIntro>
      <AdminApi4comPanel />
      <p className="muted" style={{ marginTop: "1rem" }}>
        Google Agenda, Places e motor de leads continuam em{" "}
        <Link href="/admin/variaveis">Variáveis para as APIs</Link>.
      </p>
    </div>
  );
}
