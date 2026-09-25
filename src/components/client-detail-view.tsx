"use client";

import Link from "next/link";
import { Mail, Phone, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ApproachWorkflowModal } from "@/components/approach-workflow-modal";
import { CadastroModal } from "@/components/cadastro-ui";
import { ClientContactShortcuts } from "@/components/client-contact-shortcuts";
import { MeetingFormModal } from "@/components/meeting-form-modal";
import { ClientTimeline } from "@/components/client-timeline";
import { ClientReconsultModal } from "@/components/client-reconsult-modal";
import { formatCnpj } from "@/lib/format";
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
};

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
    stage_name: string | null;
    owner_name: string | null;
  }>;
  canReconsult?: boolean;
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ClientContact[]>(initialContacts);
  const [oppList, setOppList] = useState(opportunities);
  const [newOppProductId, setNewOppProductId] = useState("");
  const [newOppTitle, setNewOppTitle] = useState("");
  const [oppModalOpen, setOppModalOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState<Array<{ id: number; title: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approachOpen, setApproachOpen] = useState(!!followUpId);
  const [meetingOpen, setMeetingOpen] = useState(!!openMeetingForm);
  const [meetingProductId, setMeetingProductId] = useState<number | undefined>();
  const [reconsultOpen, setReconsultOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [savingClient, setSavingClient] = useState(false);

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
    product_ids: linkedProducts.map((p) => p.product_id)
  });

  const clientDisplayName = initialClient.trade_name || initialClient.legal_name || "Cliente";
  const primaryContact = contacts[0];
  const primaryPhone = contacts.map((c) => c.phone).find(Boolean) ?? null;
  const primaryWhatsapp = contacts.map((c) => c.whatsapp || c.phone).find(Boolean) ?? null;
  const primaryEmail = contacts.map((c) => c.email).find(Boolean) ?? null;

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

  const [newContact, setNewContact] = useState({
    name: "",
    job_title: "",
    phone: "",
    whatsapp: "",
    email: ""
  });

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/clients/${initialClient.id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newContact, verification_status: "unverified" })
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
        verification_status: "unverified"
      }
    ]);
    setNewContact({ name: "", job_title: "", phone: "", whatsapp: "", email: "" });
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
      return;
    }
    router.refresh();
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
        product_ids: clientDraft.product_ids
      })
    });
    setSavingClient(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao salvar empresa");
      return;
    }
    setEditMode(false);
    router.refresh();
  }

  function cancelEdit() {
    setEditMode(false);
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
      product_ids: linkedProducts.map((p) => p.product_id)
    });
  }

  async function createOpportunity(force = false) {
    setError(null);
    if (!newOppProductId) {
      setError("Selecione o produto.");
      return;
    }
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: initialClient.id,
        product_id: Number(newOppProductId),
        title: newOppTitle || undefined,
        origin_bdr_user_id: initialClient.bdr_user_id,
        force_create: force
      })
    });
    const data = (await res.json()) as { error?: string; existing?: Array<{ id: number; title: string }>; id?: number };
    if (res.status === 409 && data.existing) {
      setDupOpen(data.existing);
      return;
    }
    if (!res.ok) {
      setError(data.error ?? "Erro ao criar oportunidade");
      return;
    }
    setDupOpen(null);
    setNewOppTitle("");
    setOppModalOpen(false);
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
  const productOptions =
    linkedProducts.length > 0 ? linkedProducts : allProducts.map((p) => ({ product_id: p.id, name: p.name }));

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{clientDisplayName}</h1>

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
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                setNewOppProductId(String(linkedProducts[0]?.product_id ?? ""));
                setDupOpen(null);
                setOppModalOpen(true);
              }}
            >
              Nova oportunidade
            </button>
          </div>
          {canReconsult ? (
            <button
              type="button"
              className="btn btn-icon-sm client-detail-reconsult"
              title="Reconsultar dados"
              aria-label="Reconsultar dados"
              onClick={() => setReconsultOpen(true)}
            >
              <RefreshCw size={18} />
            </button>
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
            size="md"
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

      <CadastroModal open={oppModalOpen} title="Nova oportunidade" onClose={() => setOppModalOpen(false)}>
        <div className="field">
          <label className="label">Produto</label>
          <select className="select" value={newOppProductId} onChange={(e) => setNewOppProductId(e.target.value)}>
            <option value="">Selecione</option>
            {productOptions.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Título (opcional)</label>
          <input className="input" value={newOppTitle} onChange={(e) => setNewOppTitle(e.target.value)} />
        </div>
        {dupOpen ? (
          <div className="alert" style={{ marginBottom: 12 }}>
            Já existe oportunidade aberta para este produto:
            <ul>
              {dupOpen.map((d) => (
                <li key={d.id}>
                  <Link href={`/oportunidades/${d.id}`}>{d.title}</Link>
                </li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={() => void createOpportunity(true)}>
              Criar nova mesmo assim
            </button>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => setOppModalOpen(false)}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void createOpportunity(false)}>
            Criar oportunidade
          </button>
        </div>
      </CadastroModal>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel">
        <div className="client-panel-head">
          <h3 style={{ margin: 0 }}>Empresa</h3>
          {!editMode ? (
            <button type="button" className="btn" onClick={() => setEditMode(true)}>
              Editar
            </button>
          ) : (
            <button type="button" className="btn" onClick={cancelEdit}>
              Cancelar
            </button>
          )}
        </div>

        {!editMode ? (
          <div style={{ marginTop: "0.75rem" }}>
            {hasText(initialClient.cnpj) ? (
              <InfoLine label="CNPJ">{formatCnpj(initialClient.cnpj)}</InfoLine>
            ) : null}
            {hasText(initialClient.legal_name) ? <InfoLine label="Razão social">{initialClient.legal_name}</InfoLine> : null}
            {hasText(initialClient.trade_name) ? <InfoLine label="Nome fantasia">{initialClient.trade_name}</InfoLine> : null}
            {hasText(initialClient.segment) ? <InfoLine label="Segmento">{initialClient.segment}</InfoLine> : null}
            {hasText(localLabel) ? <InfoLine label="Local">{localLabel}</InfoLine> : null}
            {hasText(initialClient.address) ? <InfoLine label="Endereço">{initialClient.address}</InfoLine> : null}
            {hasText(initialClient.website) ? (
              <InfoLine label="Site">
                <a href={initialClient.website!.startsWith("http") ? initialClient.website! : `https://${initialClient.website}`} target="_blank" rel="noreferrer">
                  {initialClient.website}
                </a>
              </InfoLine>
            ) : null}
            {hasText(initialClient.instagram) ? <InfoLine label="Instagram">{initialClient.instagram}</InfoLine> : null}
            {bdr?.name ? <InfoLine label="BDR">{bdr.name}</InfoLine> : null}
            {linkedProducts.length > 0 ? (
              <InfoLine label="Produtos">{linkedProducts.map((p) => p.name).join(", ")}</InfoLine>
            ) : null}
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
        <h3 style={{ marginTop: 0 }}>Oportunidades</h3>
        {oppList.length === 0 ? <p className="muted">Nenhuma negociação registrada.</p> : null}
        {oppList.length > 0 ? (
          <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
            {oppList.map((o) => (
              <li key={o.id} style={{ marginBottom: 8 }}>
                <Link href={`/oportunidades/${o.id}`}>
                  <strong>{o.title}</strong>
                </Link>{" "}
                — {o.product_name} · {o.stage_name ?? "—"} · {o.outcome === "open" ? "Aberta" : o.outcome === "won" ? "Ganha" : "Perdida"}
                {o.owner_name ? ` · ${o.owner_name}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="panel">
        <div className="client-panel-head">
          <h3 style={{ margin: 0 }}>Contatos</h3>
          {editMode ? null : (
            <button type="button" className="btn" onClick={() => setEditMode(true)}>
              Editar
            </button>
          )}
        </div>
        {contacts.length === 0 && !editMode ? <p className="muted">Nenhum contato cadastrado.</p> : null}

        {!editMode
          ? contacts.map((contact) => (
              <ContactReadOnly key={contact.id} contact={contact} />
            ))
          : null}

        {editMode ? (
          <>
            <form onSubmit={addContact} style={{ margin: "1rem 0", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
              <h4 style={{ marginTop: 0 }}>Adicionar contato</h4>
              <div className="field">
                <label className="label">Nome</label>
                <input className="input" value={newContact.name} onChange={(e) => setNewContact((c) => ({ ...c, name: e.target.value }))} required />
              </div>
              <div className="field">
                <label className="label">Cargo</label>
                <input className="input" value={newContact.job_title} onChange={(e) => setNewContact((c) => ({ ...c, job_title: e.target.value }))} />
              </div>
              <div className="filters-row">
                <div className="field">
                  <label className="label">Telefone</label>
                  <input className="input" value={newContact.phone} onChange={(e) => setNewContact((c) => ({ ...c, phone: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">WhatsApp</label>
                  <input className="input" value={newContact.whatsapp} onChange={(e) => setNewContact((c) => ({ ...c, whatsapp: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label className="label">E-mail</label>
                <input className="input" type="email" value={newContact.email} onChange={(e) => setNewContact((c) => ({ ...c, email: e.target.value }))} />
              </div>
              <button className="btn" type="submit">
                Salvar contato
              </button>
            </form>
            {contacts.map((contact) => (
              <ContactEditor
                key={contact.id}
                contact={contact}
                onChange={(updated) => setContacts((list) => list.map((c) => (c.id === updated.id ? updated : c)))}
                onSave={() => {
                  const current = contacts.find((c) => c.id === contact.id) ?? contact;
                  void saveContact(current);
                }}
                onVerify={(status) => void updateVerification(contact.id, status)}
              />
            ))}
          </>
        ) : null}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Histórico</h3>
        <ClientTimeline clientId={initialClient.id} />
      </div>
    </div>
  );
}

function ContactReadOnly({ contact }: { contact: ClientContact }) {
  const parts: string[] = [];
  if (hasText(contact.phone)) parts.push(contact.phone!);
  if (hasText(contact.whatsapp) && contact.whatsapp !== contact.phone) parts.push(`WhatsApp: ${contact.whatsapp}`);
  if (hasText(contact.email)) parts.push(contact.email!);

  return (
    <div className="client-contact-readonly">
      <div>
        <strong>{contact.name}</strong>
        {hasText(contact.job_title) ? <span className="muted"> · {contact.job_title}</span> : null}
        {contact.verification_status === "confirmed" ? <span className="badge badge-verified" style={{ marginLeft: 8 }}>Verificado</span> : null}
      </div>
      {parts.length > 0 ? (
        <div className="client-contact-readonly-meta">
          {hasText(contact.phone) ? (
            <span>
              <Phone size={14} aria-hidden /> {contact.phone}
            </span>
          ) : null}
          {hasText(contact.email) ? (
            <span>
              <Mail size={14} aria-hidden /> {contact.email}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ContactEditor({
  contact,
  onChange,
  onSave,
  onVerify
}: {
  contact: ClientContact;
  onChange: (c: ClientContact) => void;
  onSave: () => void;
  onVerify: (s: ContactVerification) => void;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "0.75rem 0" }}>
      <div className="filters-row">
        <div className="field">
          <label className="label">Nome</label>
          <input className="input" value={contact.name} onChange={(e) => onChange({ ...contact, name: e.target.value })} />
        </div>
        <div className="field">
          <label className="label">Cargo</label>
          <input className="input" value={contact.job_title ?? ""} onChange={(e) => onChange({ ...contact, job_title: e.target.value })} />
        </div>
      </div>
      <div className="filters-row">
        <div className="field">
          <label className="label">Telefone</label>
          <input className="input" value={contact.phone ?? ""} onChange={(e) => onChange({ ...contact, phone: e.target.value })} />
        </div>
        <div className="field">
          <label className="label">WhatsApp</label>
          <input className="input" value={contact.whatsapp ?? ""} onChange={(e) => onChange({ ...contact, whatsapp: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label className="label">E-mail</label>
        <input className="input" value={contact.email ?? ""} onChange={(e) => onChange({ ...contact, email: e.target.value })} />
      </div>
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
      <button className="btn" type="button" onClick={onSave}>
        Salvar contato
      </button>
    </div>
  );
}
