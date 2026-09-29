"use client";

import Link from "next/link";
import { Mail, Phone, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ApproachWorkflowModal } from "@/components/approach-workflow-modal";
import { CadastroModal, requestCadastroDelete } from "@/components/cadastro-ui";
import { ClientContactShortcuts, type ContactDialOption } from "@/components/client-contact-shortcuts";
import { MeetingFormModal } from "@/components/meeting-form-modal";
import { ClientTimeline } from "@/components/client-timeline";
import { ClientReconsultModal } from "@/components/client-reconsult-modal";
import { formatSpDateTime } from "@/lib/datetime";
import { externalWebHref, formatCnpj, instagramHref } from "@/lib/format";
import { LeadQualificationPicker } from "@/components/lead-qualification-picker";
import { parseLeadQualification, type LeadQualification } from "@/lib/lead-qualification";
import { CONTACT_ORIGIN, formatContactOrigin } from "@/lib/contact-origin";
import { VERIFICATION_LABELS, type ContactVerification, type Product, type User } from "@/lib/types";

export type ClientContact = {
  id: number;
  name: string;
  job_title: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  notes: string | null;
  verification_status: ContactVerification;
  is_primary_phone?: boolean;
  origin?: string | null;
};

function sortContactsForDisplay(list: ClientContact[]) {
  return [...list].sort((a, b) => {
    const pa = a.is_primary_phone ? 1 : 0;
    const pb = b.is_primary_phone ? 1 : 0;
    if (pb !== pa) return pb - pa;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function pickPrimaryContact(list: ClientContact[]) {
  const sorted = sortContactsForDisplay(list);
  return (
    sorted.find((c) => c.is_primary_phone) ??
    sorted.find((c) => c.phone?.trim() || c.whatsapp?.trim()) ??
    sorted[0]
  );
}

type ClientOpportunityListItem = {
  product_name: string;
  title: string;
  stage_name: string | null;
  outcome: string;
  engagement_status?: string;
  owner_name: string | null;
  created_at: string;
};

function formatOpportunityListDate(iso: string) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
  return formatted.replace(", ", " ");
}

function formatOpportunityListLine(o: ClientOpportunityListItem) {
  const product = o.product_name.trim().toUpperCase();
  const title = o.title.trim() || "Sem título";
  const stage = o.stage_name?.trim() || "—";
  const status =
    o.engagement_status === "closed"
      ? "Encerrada"
      : o.outcome === "open"
        ? "Aberta"
        : o.outcome === "won"
          ? "Ganha"
          : "Perdida";
  const owner = o.owner_name?.trim();
  const when = formatOpportunityListDate(o.created_at);
  const middle = [title, stage, status, owner].filter(Boolean).join(" · ");
  return `${product}: ${middle} ${when}`;
}

type Client = {
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
  lead_qualification?: string | null;
  in_prospeccao_queue?: boolean;
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function InfoLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p style={{ margin: "0.35rem 0" }}>
      <span className="muted">{label}: </span>
      {children}
    </p>
  );
}

export function ClientDetailView({
  initialClient,
  initialContacts,
  linkedProducts,
  bdr,
  allProducts,
  bdrs,
  allUsers,
  followUpId,
  openMeetingForm,
  opportunities,
  hasApproach = false,
  canReconsult
}: {
  initialClient: Client;
  initialContacts: ClientContact[];
  linkedProducts: Array<{ product_id: number; name: string }>;
  bdr: { id: number; name: string } | null;
  allProducts: Product[];
  bdrs: User[];
  allUsers: User[];
  followUpId?: number;
  openMeetingForm?: boolean;
  opportunities: Array<{
    id: number;
    product_id: number;
    product_name: string;
    title: string;
    temperature: string | null;
    outcome: string;
    engagement_status?: string;
    stage_name: string | null;
    owner_name: string | null;
    created_at: string;
  }>;
  hasApproach?: boolean;
  canReconsult?: boolean;
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ClientContact[]>(initialContacts);
  const [oppList, setOppList] = useState(opportunities);
  const [newOppProductId, setNewOppProductId] = useState("");
  const [newOppTitle, setNewOppTitle] = useState("");
  const [oppModalOpen, setOppModalOpen] = useState(false);
  const [productLinkModalOpen, setProductLinkModalOpen] = useState(false);
  const [linkProductId, setLinkProductId] = useState("");
  const [linkProductCreateOpp, setLinkProductCreateOpp] = useState(false);
  const [savingProductLink, setSavingProductLink] = useState(false);
  const [returnToProspeccao, setReturnToProspeccao] = useState(true);
  const [inProspeccao, setInProspeccao] = useState(Boolean(initialClient.in_prospeccao_queue ?? true));
  const [prospeccaoModalOpen, setProspeccaoModalOpen] = useState(false);
  const [prospeccaoProductId, setProspeccaoProductId] = useState("");
  const [prospeccaoBdrId, setProspeccaoBdrId] = useState("");
  const [savingProspeccao, setSavingProspeccao] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approachOpen, setApproachOpen] = useState(!!followUpId);
  const [meetingOpen, setMeetingOpen] = useState(!!openMeetingForm);
  const [meetingProductId, setMeetingProductId] = useState<number | undefined>();
  const [reconsultOpen, setReconsultOpen] = useState(false);
  const [editEmpresa, setEditEmpresa] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [contactEditDraft, setContactEditDraft] = useState<ClientContact | null>(null);
  const [savingContactEdit, setSavingContactEdit] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [leadQualification, setLeadQualification] = useState<LeadQualification>(
    parseLeadQualification(initialClient.lead_qualification)
  );
  const [savingQualification, setSavingQualification] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);

  const [clientDraft, setClientDraft] = useState({
    cnpj: initialClient.cnpj ?? "",
    legal_name: initialClient.legal_name ?? "",
    trade_name: initialClient.trade_name ?? "",
    segment: initialClient.segment ?? "",
    city: initialClient.city ?? "",
    uf: initialClient.uf ?? "",
    address: initialClient.address ?? "",
    website: initialClient.website ?? "",
    instagram: initialClient.instagram ?? "",
    notes: initialClient.notes ?? "",
    bdr_user_id: initialClient.bdr_user_id ? String(initialClient.bdr_user_id) : "",
    product_ids: linkedProducts.map((p) => p.product_id),
    lead_qualification: parseLeadQualification(initialClient.lead_qualification) as LeadQualification
  });

  const clientDisplayName = initialClient.trade_name || initialClient.legal_name || "Cliente";
  const primaryContact = pickPrimaryContact(contacts);
  const primaryPhone = primaryContact?.phone ?? contacts.map((c) => c.phone).find(Boolean) ?? null;
  const sortedContacts = sortContactsForDisplay(contacts);
  const contactDialOptions = sortedContacts.flatMap((c) => {
    const opts: ContactDialOption[] = [];
    if (c.phone?.trim()) {
      opts.push({ contactId: c.id, contactName: c.name, phone: c.phone, label: "Telefone" });
    }
    if (c.whatsapp?.trim() && c.whatsapp !== c.phone) {
      opts.push({ contactId: c.id, contactName: c.name, phone: c.whatsapp, label: "Telefone adicional" });
    }
    return opts;
  });
  const primaryWhatsapp =
    (primaryContact?.whatsapp || primaryContact?.phone) ??
    contacts.map((c) => c.whatsapp || c.phone).find(Boolean) ??
    null;
  const primaryEmail = primaryContact?.email ?? contacts.map((c) => c.email).find(Boolean) ?? null;

  useEffect(() => {
    if (followUpId) setApproachOpen(true);
  }, [followUpId]);

  useEffect(() => {
    if (openMeetingForm) setMeetingOpen(true);
  }, [openMeetingForm]);

  useEffect(() => {
    setOppList(opportunities);
  }, [opportunities]);

  useEffect(() => {
    setContacts(initialContacts);
  }, [initialContacts]);

  useEffect(() => {
    const q = parseLeadQualification(initialClient.lead_qualification);
    setLeadQualification(q);
    setClientDraft((d) => ({ ...d, lead_qualification: q }));
  }, [initialClient.lead_qualification]);

  useEffect(() => {
    setInProspeccao(Boolean(initialClient.in_prospeccao_queue ?? true));
  }, [initialClient.in_prospeccao_queue]);

  useEffect(() => {
    if (!oppModalOpen || linkedProducts.length === 0) return;
    setNewOppProductId(String(linkedProducts[0]!.product_id));
  }, [oppModalOpen, linkedProducts]);

  const opportunityProductOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const o of oppList) map.set(o.product_id, o.product_name);
    return [...map.entries()]
      .map(([product_id, name]) => ({ product_id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [oppList]);

  const [newContact, setNewContact] = useState({
    name: "",
    job_title: "",
    phone: "",
    whatsapp: "",
    email: ""
  });
  const [newContactSecondPhone, setNewContactSecondPhone] = useState(false);
  const [primarySavingId, setPrimarySavingId] = useState<number | null>(null);

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/clients/${initialClient.id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newContact,
        whatsapp: newContactSecondPhone ? newContact.whatsapp || null : null,
        verification_status: "unverified"
      })
    });
    const data = (await res.json()) as { error?: string; id?: number };
    if (!res.ok) {
      setError(data.error ?? "Erro ao adicionar contato");
      return;
    }
    setContacts((list) => [
      ...list,
      {
        id: data.id ?? Date.now(),
        name: newContact.name,
        job_title: newContact.job_title || null,
        phone: newContact.phone || null,
        whatsapp: newContact.whatsapp || null,
        email: newContact.email || null,
        notes: null,
        verification_status: "unverified",
        origin: CONTACT_ORIGIN.manual
      }
    ]);
    setNewContact({ name: "", job_title: "", phone: "", whatsapp: "", email: "" });
    setNewContactSecondPhone(false);
    setAddingContact(false);
    router.refresh();
  }

  async function markPrimaryPhone(contactId: number) {
    setPrimarySavingId(contactId);
    setError(null);
    const res = await fetch(`/api/contacts/${contactId}/set-primary-phone`, { method: "POST" });
    const data = (await res.json()) as { error?: string };
    setPrimarySavingId(null);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível marcar o telefone principal.");
      return;
    }
    setContacts((list) =>
      sortContactsForDisplay(list.map((c) => ({ ...c, is_primary_phone: c.id === contactId })))
    );
    router.refresh();
  }

  async function saveContact(contact: ClientContact) {
    setError(null);
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contact)
    });
    if (!res.ok) {
      setError("Erro ao salvar contato.");
      return false;
    }
    setContacts((list) => list.map((c) => (c.id === contact.id ? contact : c)));
    router.refresh();
    return true;
  }

  function openContactEdit(contact: ClientContact) {
    setContactEditDraft({ ...contact });
  }

  async function submitContactEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactEditDraft) return;
    setSavingContactEdit(true);
    const ok = await saveContact(contactEditDraft);
    setSavingContactEdit(false);
    if (ok) setContactEditDraft(null);
  }

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    setSavingClient(true);
    setError(null);
    const res = await fetch(`/api/clients/${initialClient.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cnpj: clientDraft.cnpj || null,
        legal_name: clientDraft.legal_name || null,
        trade_name: clientDraft.trade_name || null,
        segment: clientDraft.segment || null,
        city: clientDraft.city || null,
        uf: clientDraft.uf || null,
        address: clientDraft.address || null,
        website: clientDraft.website || null,
        instagram: clientDraft.instagram || null,
        notes: clientDraft.notes || null,
        bdr_user_id: clientDraft.bdr_user_id ? Number(clientDraft.bdr_user_id) : null,
        product_ids: clientDraft.product_ids,
        lead_qualification: clientDraft.lead_qualification
      })
    });
    setSavingClient(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao salvar empresa");
      return;
    }
    setEditEmpresa(false);
    router.refresh();
  }

  function cancelEmpresaEdit() {
    setEditEmpresa(false);
    setClientDraft({
      cnpj: initialClient.cnpj ?? "",
      legal_name: initialClient.legal_name ?? "",
      trade_name: initialClient.trade_name ?? "",
      segment: initialClient.segment ?? "",
      city: initialClient.city ?? "",
      uf: initialClient.uf ?? "",
      address: initialClient.address ?? "",
      website: initialClient.website ?? "",
      instagram: initialClient.instagram ?? "",
      notes: initialClient.notes ?? "",
      bdr_user_id: initialClient.bdr_user_id ? String(initialClient.bdr_user_id) : "",
      product_ids: linkedProducts.map((p) => p.product_id),
      lead_qualification: parseLeadQualification(initialClient.lead_qualification)
    });
  }

  async function changeLeadQualification(next: LeadQualification) {
    if (next === leadQualification || savingQualification) return;
    setSavingQualification(true);
    setError(null);
    const prev = leadQualification;
    setLeadQualification(next);
    const res = await fetch(`/api/clients/${initialClient.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_qualification: next })
    });
    setSavingQualification(false);
    if (!res.ok) {
      setLeadQualification(prev);
      setError("Erro ao atualizar qualificação.");
      return;
    }
    router.refresh();
  }

  function cancelContactsEdit() {
    setAddingContact(false);
    setContactEditDraft(null);
    setContacts(initialContacts);
    setNewContact({ name: "", job_title: "", phone: "", whatsapp: "", email: "" });
    setNewContactSecondPhone(false);
  }

  function openProductLinkModal() {
    setError(null);
    const available = allProducts.filter((p) => !linkedProducts.some((lp) => lp.product_id === p.id));
    setLinkProductId(available[0] ? String(available[0].id) : allProducts[0] ? String(allProducts[0].id) : "");
    setLinkProductCreateOpp(false);
    setProductLinkModalOpen(true);
  }

  async function confirmProductLink() {
    if (!linkProductId) {
      setError("Selecione o produto.");
      return;
    }
    setSavingProductLink(true);
    setError(null);
    const res = await fetch(`/api/clients/${initialClient.id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: Number(linkProductId),
        create_opportunity: linkProductCreateOpp
      })
    });
    const data = (await res.json()) as { error?: string };
    setSavingProductLink(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao associar produto");
      return;
    }
    setProductLinkModalOpen(false);
    router.refresh();
  }

  function openOppModal() {
    setError(null);
    if (linkedProducts.length === 0) {
      setError("Vincule ao menos um produto em Empresa antes de criar a oportunidade.");
      return;
    }
    setNewOppProductId(String(linkedProducts[0]!.product_id));
    setReturnToProspeccao(true);
    setOppModalOpen(true);
  }

  function openEnrollProspeccaoModal() {
    setError(null);
    if (!opportunityProductOptions.length) {
      setError("Cadastre uma oportunidade antes de colocar o cliente em prospecção.");
      return;
    }
    setProspeccaoProductId(String(opportunityProductOptions[0].product_id));
    const defaultBdr =
      initialClient.bdr_user_id ?? bdr?.id ?? (bdrs[0]?.id != null ? bdrs[0].id : null);
    setProspeccaoBdrId(defaultBdr != null ? String(defaultBdr) : "");
    setProspeccaoModalOpen(true);
  }

  async function confirmEnrollProspeccao() {
    if (!prospeccaoProductId) {
      setError("Selecione o produto.");
      return;
    }
    if (!prospeccaoBdrId) {
      setError("Selecione a BDR.");
      return;
    }
    setSavingProspeccao(true);
    setError(null);
    const res = await fetch(`/api/clients/${initialClient.id}/prospeccao-queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: Number(prospeccaoProductId),
        bdr_user_id: Number(prospeccaoBdrId)
      })
    });
    const data = (await res.json()) as { error?: string };
    setSavingProspeccao(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao entrar na prospecção");
      return;
    }
    setInProspeccao(true);
    setProspeccaoModalOpen(false);
    router.refresh();
  }

  async function createOpportunity() {
    setError(null);
    const productId = Number(newOppProductId) || linkedProducts[0]?.product_id;
    if (!productId) {
      setError("Vincule um produto ao cliente em Empresa.");
      return;
    }
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: initialClient.id,
        product_id: productId,
        title: newOppTitle || undefined,
        origin_bdr_user_id: initialClient.bdr_user_id,
        return_to_prospection: returnToProspeccao
      })
    });
    const data = (await res.json()) as { error?: string; id?: number };
    if (!res.ok) {
      setError(data.error ?? "Erro ao criar oportunidade");
      return;
    }
    setNewOppTitle("");
    setOppModalOpen(false);
    router.refresh();
  }

  async function removeOpportunity(opp: (typeof oppList)[0]) {
    if (!(await requestCadastroDelete(opp.title))) return;
    setError(null);
    const res = await fetch(`/api/opportunities/${opp.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Não foi possível excluir a oportunidade");
      return;
    }
    setOppList((list) => list.filter((o) => o.id !== opp.id));
    router.refresh();
  }

  async function removeClient() {
    const label = clientDisplayName;
    const ok = window.confirm(
      `Excluir o cliente “${label}”?\n\nSerão removidos contatos, abordagens, oportunidades, agendamentos e demais registros vinculados a este lead. Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    setDeletingClient(true);
    setError(null);
    const res = await fetch(`/api/clients/${initialClient.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    setDeletingClient(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível excluir o cliente");
      return;
    }
    router.push("/clientes");
    router.refresh();
  }

  async function updateVerification(contactId: number, status: ContactVerification) {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...contact, verification_status: status })
    });
    if (!res.ok) {
      setError("Não foi possível atualizar verificação.");
      return;
    }
    setContacts((list) => list.map((c) => (c.id === contactId ? { ...c, verification_status: status } : c)));
    router.refresh();
  }

  const localLabel = [initialClient.city, initialClient.uf].filter(Boolean).join(" / ");
  const websiteHref = externalWebHref(initialClient.website);
  const instagramLink = instagramHref(initialClient.instagram);
  /** Produtos do cadastro do cliente (oportunidade sempre vinculada a eles). */
  const oppProductOptions = linkedProducts;
  const productOptions =
    linkedProducts.length > 0 ? linkedProducts : allProducts.map((p) => ({ product_id: p.id, name: p.name }));

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{clientDisplayName}</h1>
      <div className="field" style={{ marginBottom: "1rem" }}>
        <label className="label">Qualificação do lead</label>
        <LeadQualificationPicker
          value={leadQualification}
          onChange={(q) => void changeLeadQualification(q)}
          disabled={savingQualification}
        />
      </div>

      <div className="field" style={{ marginBottom: "1rem" }}>
        <label className="label">Prospecção</label>
        <p style={{ margin: "0.35rem 0 0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem 0.75rem" }}>
          <span>
            Em prospecção: <strong>{inProspeccao ? "Sim" : "Não"}</strong>
          </span>
          {!inProspeccao ? (
            <button type="button" className="btn" onClick={openEnrollProspeccaoModal}>
              Colocar em prospecção
            </button>
          ) : null}
        </p>
      </div>

      <div className="client-detail-actions">
        <div className="client-detail-actions-row">
          <div className="client-detail-actions-primary">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setApproachOpen(true)}
            >
              Registrar abordagem
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                setMeetingProductId(linkedProducts[0]?.product_id);
                setMeetingOpen(true);
              }}
            >
              Agendar reunião
            </button>
            <button className="btn btn-primary" type="button" onClick={openOppModal}>
              Nova oportunidade
            </button>
          </div>
          {canReconsult ? (
            <div className="client-detail-admin-tools">
              <button
                type="button"
                className="btn btn-icon-sm"
                title="Reconsultar dados"
                aria-label="Reconsultar dados"
                onClick={() => setReconsultOpen(true)}
              >
                <RefreshCw size={18} />
              </button>
              <button
                type="button"
                className="btn btn-icon-sm client-detail-delete"
                title="Excluir cliente"
                aria-label="Excluir cliente"
                disabled={deletingClient}
                onClick={() => void removeClient()}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ) : null}
        </div>
        <div className="client-detail-actions-row client-detail-contact-row">
          <span className="muted client-detail-contact-label">Contato rápido</span>
          <ClientContactShortcuts
            clientName={clientDisplayName}
            contactName={primaryContact?.name}
            phone={primaryPhone}
            whatsapp={primaryWhatsapp}
            email={primaryEmail}
            productId={linkedProducts[0]?.product_id}
            productName={linkedProducts[0]?.name}
            clientId={initialClient.id}
            contactId={primaryContact?.id}
            dialOptions={contactDialOptions}
            size="sm"
          />
        </div>
      </div>

      <ClientReconsultModal
        open={reconsultOpen}
        clientId={initialClient.id}
        onClose={() => setReconsultOpen(false)}
        onApplied={() => router.refresh()}
      />

      <MeetingFormModal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        clientId={initialClient.id}
        clientName={clientDisplayName}
        contacts={contacts}
        products={allProducts.filter((p) => linkedProducts.some((lp) => lp.product_id === p.id) || linkedProducts.length === 0)}
        bdrs={bdrs}
        allUsers={allUsers}
        defaultBdrUserId={initialClient.bdr_user_id ?? bdrs[0]?.id}
        defaultProductId={meetingProductId ?? linkedProducts[0]?.product_id}
        defaultContactId={primaryContact?.id}
      />
      <ApproachWorkflowModal
        open={approachOpen}
        onClose={() => setApproachOpen(false)}
        clientId={initialClient.id}
        clientName={clientDisplayName}
        contacts={contacts}
        products={allProducts.filter((p) => linkedProducts.some((lp) => lp.product_id === p.id) || linkedProducts.length === 0)}
        defaultChannel="call"
        defaultContactId={primaryContact?.id}
        defaultProductId={linkedProducts[0]?.product_id}
        followUpId={followUpId}
      />

      <CadastroModal
        open={prospeccaoModalOpen}
        title="Entrar na prospecção"
        onClose={() => !savingProspeccao && setProspeccaoModalOpen(false)}
      >
        <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: "0.875rem" }}>
          O cliente voltará à fila de prospecção. Escolha o produto (das oportunidades deste cliente) e a BDR responsável.
        </p>
        <div className="field">
          <label className="label">Produto</label>
          <select
            className="select"
            value={prospeccaoProductId}
            onChange={(e) => setProspeccaoProductId(e.target.value)}
            disabled={savingProspeccao}
          >
            <option value="">Selecione</option>
            {opportunityProductOptions.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">BDR</label>
          <select
            className="select"
            value={prospeccaoBdrId}
            onChange={(e) => setProspeccaoBdrId(e.target.value)}
            disabled={savingProspeccao}
          >
            <option value="">Selecione</option>
            {bdrs.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn"
            disabled={savingProspeccao}
            onClick={() => setProspeccaoModalOpen(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingProspeccao}
            onClick={() => void confirmEnrollProspeccao()}
          >
            {savingProspeccao ? "Salvando…" : "Confirmar"}
          </button>
        </div>
      </CadastroModal>

      <CadastroModal
        open={productLinkModalOpen}
        title="Associar produto ao cliente"
        onClose={() => !savingProductLink && setProductLinkModalOpen(false)}
      >
        <p className="muted" style={{ marginTop: 0, fontSize: "0.875rem" }}>
          O produto é adicionado ao cadastro; os já vinculados permanecem.
        </p>
        <div className="field">
          <label className="label">Produto</label>
          <select
            className="select"
            value={linkProductId}
            onChange={(e) => setLinkProductId(e.target.value)}
            disabled={savingProductLink}
          >
            <option value="">Selecione</option>
            {allProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {linkedProducts.some((lp) => lp.product_id === p.id) ? " (já vinculado)" : ""}
              </option>
            ))}
          </select>
        </div>
        <label style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={linkProductCreateOpp}
            onChange={(e) => setLinkProductCreateOpp(e.target.checked)}
            disabled={savingProductLink}
            style={{ marginTop: 4 }}
          />
          <span>Criar oportunidade aberta para este produto</span>
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" disabled={savingProductLink} onClick={() => setProductLinkModalOpen(false)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={savingProductLink} onClick={() => void confirmProductLink()}>
            {savingProductLink ? "Salvando…" : "Confirmar"}
          </button>
        </div>
      </CadastroModal>

      <CadastroModal open={oppModalOpen} title="Nova oportunidade" onClose={() => setOppModalOpen(false)}>
        <div className="field">
          <label className="label">Produto</label>
          {oppProductOptions.length === 1 ? (
            <p style={{ margin: "0.35rem 0 0", fontWeight: 600 }}>{oppProductOptions[0]!.name}</p>
          ) : (
            <select className="select" value={newOppProductId} onChange={(e) => setNewOppProductId(e.target.value)}>
              {oppProductOptions.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <p className="muted" style={{ fontSize: "0.8125rem", marginTop: 6, marginBottom: 0 }}>
            Produto(s) vinculado(s) ao cadastro da empresa.
          </p>
        </div>
        <div className="field">
          <label className="label">Título (opcional)</label>
          <input className="input" value={newOppTitle} onChange={(e) => setNewOppTitle(e.target.value)} />
        </div>
        <label style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={returnToProspeccao}
            onChange={(e) => setReturnToProspeccao(e.target.checked)}
            style={{ marginTop: 4 }}
          />
          <span>
            Retornar o cliente para a lista de prospecção (nova ligação)
            <span className="muted" style={{ display: "block", fontSize: "0.8125rem", marginTop: 4 }}>
              {hasApproach
                ? "Como já houve tentativa de contato, ele entrará na fila como Retorno."
                : "Entrará na prospecção para primeiro contato."}
            </span>
          </span>
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => setOppModalOpen(false)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void createOpportunity()}>
            Criar oportunidade
          </button>
        </div>
      </CadastroModal>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel">
        <div className="client-panel-head">
          <h3 style={{ margin: 0 }}>Empresa</h3>
          {!editEmpresa ? (
            <button type="button" className="btn" onClick={() => setEditEmpresa(true)}>
              Editar
            </button>
          ) : (
            <button type="button" className="btn" onClick={cancelEmpresaEdit}>
              Cancelar
            </button>
          )}
        </div>

        {!editEmpresa ? (
          <div style={{ marginTop: "0.75rem" }}>
            {hasText(initialClient.cnpj) ? (
              <InfoLine label="CNPJ">{formatCnpj(initialClient.cnpj)}</InfoLine>
            ) : null}
            {hasText(initialClient.legal_name) ? <InfoLine label="Razão social">{initialClient.legal_name}</InfoLine> : null}
            {hasText(initialClient.trade_name) ? <InfoLine label="Nome fantasia">{initialClient.trade_name}</InfoLine> : null}
            {hasText(initialClient.segment) ? <InfoLine label="Segmento">{initialClient.segment}</InfoLine> : null}
            {hasText(localLabel) ? <InfoLine label="Local">{localLabel}</InfoLine> : null}
            {hasText(initialClient.address) ? <InfoLine label="Endereço">{initialClient.address}</InfoLine> : null}
            {hasText(initialClient.website) && websiteHref ? (
              <InfoLine label="Site">
                <a className="app-text-link" href={websiteHref} target="_blank" rel="noreferrer noopener">
                  {initialClient.website}
                </a>
              </InfoLine>
            ) : null}
            {hasText(initialClient.instagram) && instagramLink ? (
              <InfoLine label="Instagram">
                <a className="app-text-link" href={instagramLink} target="_blank" rel="noreferrer noopener">
                  {initialClient.instagram}
                </a>
              </InfoLine>
            ) : null}
            {bdr?.name ? <InfoLine label="BDR">{bdr.name}</InfoLine> : null}
            <InfoLine label="Produtos">
              {linkedProducts.length > 0 ? linkedProducts.map((p) => p.name).join(", ") : "Nenhum"}
              <button
                type="button"
                className="btn"
                style={{ marginLeft: 12, verticalAlign: "middle" }}
                onClick={openProductLinkModal}
              >
                Associar produto
              </button>
            </InfoLine>
            {hasText(initialClient.notes) ? <InfoLine label="Observações">{initialClient.notes}</InfoLine> : null}
          </div>
        ) : (
          <form onSubmit={saveClient} style={{ marginTop: "0.75rem" }}>
            <div className="field">
              <label className="label">CNPJ</label>
              <input className="input" value={clientDraft.cnpj} onChange={(e) => setClientDraft((d) => ({ ...d, cnpj: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Razão social</label>
              <input className="input" value={clientDraft.legal_name} onChange={(e) => setClientDraft((d) => ({ ...d, legal_name: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Nome fantasia</label>
              <input className="input" value={clientDraft.trade_name} onChange={(e) => setClientDraft((d) => ({ ...d, trade_name: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Qualificação do lead</label>
              <LeadQualificationPicker
                value={clientDraft.lead_qualification}
                showCurrentLabel={false}
                onChange={(lead_qualification) => {
                  setClientDraft((d) => ({ ...d, lead_qualification }));
                  setLeadQualification(lead_qualification);
                }}
              />
            </div>
            <div className="filters-row">
              <div className="field">
                <label className="label">Segmento</label>
                <input className="input" value={clientDraft.segment} onChange={(e) => setClientDraft((d) => ({ ...d, segment: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Cidade</label>
                <input className="input" value={clientDraft.city} onChange={(e) => setClientDraft((d) => ({ ...d, city: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">UF</label>
                <input className="input" maxLength={2} value={clientDraft.uf} onChange={(e) => setClientDraft((d) => ({ ...d, uf: e.target.value }))} />
              </div>
            </div>
            <div className="field">
              <label className="label">Endereço</label>
              <input className="input" value={clientDraft.address} onChange={(e) => setClientDraft((d) => ({ ...d, address: e.target.value }))} />
            </div>
            <div className="filters-row">
              <div className="field">
                <label className="label">Site</label>
                <input className="input" value={clientDraft.website} onChange={(e) => setClientDraft((d) => ({ ...d, website: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Instagram</label>
                <input className="input" value={clientDraft.instagram} onChange={(e) => setClientDraft((d) => ({ ...d, instagram: e.target.value }))} />
              </div>
            </div>
            <div className="field">
              <label className="label">BDR</label>
              <select className="select" value={clientDraft.bdr_user_id} onChange={(e) => setClientDraft((d) => ({ ...d, bdr_user_id: e.target.value }))}>
                <option value="">—</option>
                {bdrs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="label">Produtos vinculados</span>
              {allProducts.map((p) => (
                <label key={p.id} style={{ display: "block", marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={clientDraft.product_ids.includes(p.id)}
                    onChange={() =>
                      setClientDraft((d) => ({
                        ...d,
                        product_ids: d.product_ids.includes(p.id) ? d.product_ids.filter((id) => id !== p.id) : [...d.product_ids, p.id]
                      }))
                    }
                  />{" "}
                  {p.name}
                </label>
              ))}
            </div>
            <div className="field">
              <label className="label">Observações</label>
              <textarea className="textarea" value={clientDraft.notes} onChange={(e) => setClientDraft((d) => ({ ...d, notes: e.target.value }))} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={savingClient}>
              {savingClient ? "Salvando…" : "Salvar empresa"}
            </button>
          </form>
        )}
      </div>

      <div className="panel">
        <div className="client-panel-head">
          <h3 style={{ margin: 0 }}>Oportunidades</h3>
          <button
            type="button"
            className="btn btn-icon-sm"
            title="Nova oportunidade"
            aria-label="Nova oportunidade"
            onClick={openOppModal}
          >
            <Plus size={18} />
          </button>
        </div>
        {oppList.length === 0 ? <p className="muted" style={{ marginTop: "0.75rem" }}>Nenhuma negociação registrada.</p> : null}
        {oppList.length > 0 ? (
          <ul style={{ paddingLeft: "1.1rem", margin: "0.75rem 0 0" }}>
            {oppList.map((o) => (
              <li key={o.id} style={{ marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: "0.9375rem" }}>
                  <Link href={`/oportunidades/${o.id}`}>{formatOpportunityListLine(o)}</Link>
                </div>
                <button
                  type="button"
                  className="btn btn-icon-sm"
                  title="Excluir oportunidade"
                  aria-label={`Excluir oportunidade ${o.title}`}
                  onClick={() => void removeOpportunity(o)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="panel">
        <div className="client-panel-head">
          <h3 style={{ margin: 0 }}>Contatos</h3>
          <div className="client-panel-head-actions">
            {!addingContact ? (
              <button type="button" className="btn" onClick={() => setAddingContact(true)}>
                Novo
              </button>
            ) : (
              <button type="button" className="btn" onClick={cancelContactsEdit}>
                Cancelar
              </button>
            )}
          </div>
        </div>
        {contacts.length === 0 && !addingContact ? (
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Nenhum contato cadastrado.
          </p>
        ) : null}

        {sortedContacts.map((contact) => (
          <ContactReadOnly
            key={contact.id}
            contact={contact}
            onEdit={() => openContactEdit(contact)}
            onSetPrimary={() => void markPrimaryPhone(contact.id)}
            settingPrimary={primarySavingId === contact.id}
          />
        ))}

        <CadastroModal
          open={contactEditDraft !== null}
          title={contactEditDraft ? `Editar contato — ${contactEditDraft.name}` : "Editar contato"}
          onClose={() => setContactEditDraft(null)}
        >
          {contactEditDraft ? (
            <form onSubmit={(e) => void submitContactEdit(e)}>
              <ContactEditor
                contact={contactEditDraft}
                onChange={setContactEditDraft}
                onVerify={async (status) => {
                  const updated = { ...contactEditDraft, verification_status: status };
                  setContactEditDraft(updated);
                  const ok = await saveContact(updated);
                  if (ok) setContacts((list) => list.map((c) => (c.id === updated.id ? updated : c)));
                }}
                hideSaveButton
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: "0.75rem" }}>
                <button type="button" className="btn" onClick={() => setContactEditDraft(null)} disabled={savingContactEdit}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingContactEdit}>
                  {savingContactEdit ? "Salvando…" : "Salvar contato"}
                </button>
              </div>
            </form>
          ) : null}
        </CadastroModal>

        {addingContact ? (
          <form
            onSubmit={addContact}
            style={{
              marginTop: "0.75rem",
              paddingTop: "0.75rem",
              borderTop: contacts.length ? "1px solid var(--border)" : undefined
            }}
          >
            <h4 style={{ marginTop: 0 }}>Novo contato</h4>
            <ContactFormFields
              name={newContact.name}
              job_title={newContact.job_title}
              phone={newContact.phone}
              email={newContact.email}
              secondPhone={newContact.whatsapp}
              includeSecondPhone={newContactSecondPhone}
              onIncludeSecondPhoneChange={(open) => {
                setNewContactSecondPhone(open);
                if (!open) setNewContact((c) => ({ ...c, whatsapp: "" }));
              }}
              onChange={(patch) => setNewContact((c) => ({ ...c, ...patch }))}
              nameRequired
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" type="submit">
                Salvar contato
              </button>
              <button type="button" className="btn" onClick={() => setAddingContact(false)}>
                Fechar
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Histórico</h3>
        <ClientTimeline clientId={initialClient.id} />
      </div>
    </div>
  );
}

function ContactReadOnly({
  contact,
  onEdit,
  onSetPrimary,
  settingPrimary
}: {
  contact: ClientContact;
  onEdit: () => void;
  onSetPrimary: () => void;
  settingPrimary?: boolean;
}) {
  const canBePrimary = hasText(contact.phone) || hasText(contact.whatsapp);
  const isPrimary = Boolean(contact.is_primary_phone);

  return (
    <div className="client-contact-readonly">
      <div className="client-contact-readonly-body">
        <div>
          <strong>{contact.name}</strong>
          {hasText(contact.job_title) ? <span className="muted"> · {contact.job_title}</span> : null}
          {isPrimary ? (
            <span className="badge badge-contact-primary" title="Usado em Ligar e prospecção">
              <Star size={11} aria-hidden />
              Principal
            </span>
          ) : null}
          {contact.verification_status === "confirmed" ? (
            <span className="badge badge-verified client-contact-badge-gap">
              Verificado
            </span>
          ) : null}
        </div>
        <div className="client-contact-readonly-meta">
          {hasText(contact.phone) ? (
            <span>
              <Phone size={14} aria-hidden /> {contact.phone}
            </span>
          ) : null}
          {hasText(contact.whatsapp) && contact.whatsapp !== contact.phone ? (
            <span>
              <Phone size={14} aria-hidden /> {contact.whatsapp}
              <span className="muted"> (telefone adicional)</span>
            </span>
          ) : null}
          {hasText(contact.email) ? (
            <span>
              <Mail size={14} aria-hidden /> {contact.email}
            </span>
          ) : null}
          <span className="muted">Origem: {formatContactOrigin(contact.origin)}</span>
        </div>
      </div>
      <div className="client-contact-readonly-actions" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
        {canBePrimary && !isPrimary ? (
          <button
            type="button"
            className="btn"
            disabled={settingPrimary}
            onClick={onSetPrimary}
            title="Usar este contato em Ligar, WhatsApp rápido e lista de prospecção"
          >
            {settingPrimary ? "Salvando…" : "Marcar telefone principal"}
          </button>
        ) : null}
        <button type="button" className="btn client-contact-edit-btn" onClick={onEdit}>
          Editar
        </button>
      </div>
    </div>
  );
}

type ContactFormPatch = {
  name?: string;
  job_title?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
};

function ContactFormFields({
  name,
  job_title,
  phone,
  email,
  secondPhone,
  includeSecondPhone,
  onIncludeSecondPhoneChange,
  onChange,
  nameRequired
}: {
  name: string;
  job_title: string;
  phone: string;
  email: string;
  secondPhone: string;
  includeSecondPhone: boolean;
  onIncludeSecondPhoneChange: (open: boolean) => void;
  onChange: (patch: ContactFormPatch) => void;
  nameRequired?: boolean;
}) {
  return (
    <>
      <div className="field">
        <label className="label">Nome</label>
        <input
          className="input"
          value={name}
          onChange={(e) => onChange({ name: e.target.value })}
          required={nameRequired}
        />
      </div>
      <div className="field">
        <label className="label">Cargo</label>
        <input className="input" value={job_title} onChange={(e) => onChange({ job_title: e.target.value })} />
      </div>
      <div className="field">
        <label className="label">Telefone</label>
        <input className="input" value={phone} onChange={(e) => onChange({ phone: e.target.value })} />
      </div>
      <div className="field">
        <label className="label">E-mail</label>
        <input className="input" type="email" value={email} onChange={(e) => onChange({ email: e.target.value })} />
      </div>
      {!includeSecondPhone ? (
        <button type="button" className="btn contact-add-phone-btn" onClick={() => onIncludeSecondPhoneChange(true)}>
          + Incluir outro telefone
        </button>
      ) : (
        <div className="field">
          <div className="contact-second-phone-head">
            <label className="label" style={{ marginBottom: 0 }}>
              Telefone adicional
            </label>
            <button type="button" className="btn contact-second-phone-remove" onClick={() => onIncludeSecondPhoneChange(false)}>
              Remover
            </button>
          </div>
          <input
            className="input"
            value={secondPhone}
            onChange={(e) => onChange({ whatsapp: e.target.value })}
            placeholder="Opcional"
          />
        </div>
      )}
    </>
  );
}

function ContactEditor({
  contact,
  onChange,
  onSave,
  onVerify,
  hideSaveButton
}: {
  contact: ClientContact;
  onChange: (c: ClientContact) => void;
  onSave?: () => void;
  onVerify: (s: ContactVerification) => void | Promise<void>;
  hideSaveButton?: boolean;
}) {
  const [includeSecondPhone, setIncludeSecondPhone] = useState(() => hasText(contact.whatsapp));

  useEffect(() => {
    setIncludeSecondPhone(hasText(contact.whatsapp));
  }, [contact.id, contact.whatsapp]);

  return (
    <div>
      <ContactFormFields
        name={contact.name}
        job_title={contact.job_title ?? ""}
        phone={contact.phone ?? ""}
        email={contact.email ?? ""}
        secondPhone={contact.whatsapp ?? ""}
        includeSecondPhone={includeSecondPhone}
        onIncludeSecondPhoneChange={(open) => {
          setIncludeSecondPhone(open);
          if (!open) onChange({ ...contact, whatsapp: "" });
        }}
        onChange={(patch) => onChange({ ...contact, ...patch })}
      />
      <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
        Origem: {formatContactOrigin(contact.origin)}
      </p>
      {contact.verification_status === "confirmed" ? <span className="badge badge-verified">Verificado</span> : null}
      <div className="field" style={{ maxWidth: 280, marginTop: 8 }}>
        <label className="label">Verificação do número</label>
        <select className="select" value={contact.verification_status} onChange={(e) => onVerify(e.target.value as ContactVerification)}>
          {Object.entries(VERIFICATION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {!hideSaveButton && onSave ? (
        <button className="btn" type="button" onClick={onSave}>
          Salvar contato
        </button>
      ) : null}
    </div>
  );
}
