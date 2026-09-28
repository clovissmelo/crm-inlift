import { AdminGooglePlacesPanel } from "@/components/admin-google-places-panel";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";

export default async function AdminIntegracoesGooglePlacesPage() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/dashboard");

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/admin/integracoes">← Integrações</Link>
      </p>
      <PageIntro>Google Places para enriquecimento na geração de leads de postos (Admin → Novos leads).</PageIntro>
      <AdminGooglePlacesPanel />
    </div>
  );
}
