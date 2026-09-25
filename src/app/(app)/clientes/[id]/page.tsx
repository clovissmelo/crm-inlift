import { notFound } from "next/navigation";
import { ClientDetailView, type ClientContact } from "@/components/client-detail-view";
import { loadCatalog } from "@/lib/catalog";
import { getClientDetail } from "@/lib/clients";
import { listClientOpportunities } from "@/lib/opportunities";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ follow_up?: string; agendar?: string }> };

export default async function ClienteDetailPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) notFound();

  const detail = await getClientDetail(clientId);
  if (!detail) notFound();

  const { products, bdrs, users } = await loadCatalog();
  const opportunities = await listClientOpportunities(clientId);
  const followUpId = sp.follow_up ? Number(sp.follow_up) : undefined;
  const openMeeting = sp.agendar === "1";

  const client = detail.client as {
    id: number;
    cnpj: string | null;
    legal_name: string | null;
    trade_name: string | null;
    segment: string | null;
    city: string | null;
    uf: string | null;
    address: string | null;
    website: string | null;
    instagram: string | null;
    notes: string | null;
    bdr_user_id: number | null;
  };

  return (
    <ClientDetailView
      initialClient={client}
      initialContacts={detail.contacts as ClientContact[]}
      linkedProducts={detail.products}
      bdr={detail.bdr}
      allProducts={products}
      bdrs={bdrs}
      allUsers={users}
      followUpId={Number.isFinite(followUpId) ? followUpId : undefined}
      openMeetingForm={openMeeting}
      opportunities={opportunities}
    />
  );
}
