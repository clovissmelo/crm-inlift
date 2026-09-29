import { AdminApi4comPanel } from "@/components/admin-api4com-panel";
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
      <PageIntro>Token, gateway, webhook e registro na API4COM — tudo nesta página.</PageIntro>
      <AdminApi4comPanel />
    </div>
  );
}
