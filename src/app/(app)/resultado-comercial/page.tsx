import { ResultadoComercialAdmin } from "@/components/resultado-comercial-admin";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResultadoComercialPage() {
  const user = await requireUser();
  return <ResultadoComercialAdmin canDelete={isAdmin(user)} />;
}
