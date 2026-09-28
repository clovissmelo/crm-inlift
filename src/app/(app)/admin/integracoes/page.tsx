import { AdminIntegracoesHub } from "@/components/admin-integracoes-hub";
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
      <AdminIntegracoesHub />
    </div>
  );
}
