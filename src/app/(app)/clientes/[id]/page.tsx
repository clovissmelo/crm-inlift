import { notFound } from "next/navigation";
import { ClientDetailView, type ClientContact } from "@/components/client-detail-view";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { get } from "@/lib/db";
import { getClientDetail, serializeClientForDetailPage, serializeContactForDetailPage } from "@/lib/clients";
import {
  contactLastCallMapToRecord,
  getLastCallAttemptsByContactId,
  type ContactLastCallAttempt
} from "@/lib/contact-last-call";
import { listClientOpportunities } from "@/lib/opportunities";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ follow_up?: string; agendar?: string }> };

export default async function ClienteDetailPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) notFound();

  const user = await requireUser();
  const detail = await getClientDetail(clientId);
  if (!detail) notFound();

  const { products, bdrs, users } = await loadCatalog();
  const opportunities = await listClientOpportunities(clientId);
  const hasApproachRow = await get<{ ok: number | null }>(
    "SELECT 1 AS ok FROM approaches WHERE client_id = @clientId LIMIT 1",
    { clientId }
  );
  const hasApproach = Boolean(hasApproachRow?.ok);
  let contactLastCalls: Record<number, ContactLastCallAttempt> = {};
  try {
    contactLastCalls = contactLastCallMapToRecord(await getLastCallAttemptsByContactId(clientId));
  } catch (err) {
    console.error("[clientes/[id]] getLastCallAttemptsByContactId", clientId, err);
  }
  const followUpId = sp.follow_up ? Number(sp.follow_up) : undefined;
  const openMeeting = sp.agendar === "1";

  const client = serializeClientForDetailPage(detail.client);
  const initialContacts = detail.contacts.map((row) =>
    serializeContactForDetailPage(row as Record<string, unknown>)
  ) as ClientContact[];

  return (
    <ClientDetailView
      initialClient={client}
      initialContacts={initialContacts}
      contactLastCalls={contactLastCalls}
      linkedProducts={detail.products}
      bdr={detail.bdr}
      allProducts={products}
      bdrs={bdrs}
      allUsers={users}
      followUpId={Number.isFinite(followUpId) ? followUpId : undefined}
      openMeetingForm={openMeeting}
      opportunities={opportunities}
      hasApproach={hasApproach}
      canReconsult={isAdmin(user)}
    />
  );
}
