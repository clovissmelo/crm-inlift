import { AdminApi4comTabs } from "@/components/admin-api4com-tabs";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";

export default async function AdminIntegracoesApi4comPage() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/dashboard");

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <PageIntro>
        Telefonia API4COM: credenciais, webhook e mapeamento dos códigos técnicos do provedor para resultados da ligação.
      </PageIntro>
      <AdminApi4comTabs />
    </div>
  );
}
