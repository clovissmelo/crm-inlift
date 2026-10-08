import { SimuladorScriptPageView } from "@/components/simulador-script-page-view";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SimuladorScriptPage() {
  await requireUser();
  return <SimuladorScriptPageView />;
}
