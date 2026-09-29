import { AdminGoogleCalendarPanel } from "@/components/admin-google-calendar-panel";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";

export default async function AdminIntegracoesGoogleAgendaPage() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/dashboard");

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin">← Admin</Link>
      </p>
      <PageIntro>Google Agenda e Meet — credenciais OAuth no banco; conexão da conta abaixo.</PageIntro>
      <AdminGoogleCalendarPanel />
    </div>
  );
}
