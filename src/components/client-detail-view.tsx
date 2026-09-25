"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApproachWorkflowModal } from "@/components/approach-workflow-modal";
import { MeetingFormModal } from "@/components/meeting-form-modal";
import { ClientTimeline } from "@/components/client-timeline";
import { WhatsAppTemplateModal } from "@/components/whatsapp-template-modal";
import { formatCnpj, mailtoLink, telLink } from "@/lib/format";
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
  opportunities
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
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ClientContact[]>(initialContacts);
  const [oppList, setOppList] = useState(opportunities);
  const [newOppProductId, setNewOppProductId] = useState("");
  const [newOppTitle, setNewOppTitle] = useState("");
  const [dupOpen, setDupOpen] = useState<Array<{ id: number; title: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approachOpen, setApproachOpen] = useState(!!followUpId);
  const [meetingOpen, setMeetingOpen] = useState(!!openMeetingForm);
  const [meetingProductId, setMeetingProductId] = useState<number | undefined>();
  const [approachChannel, setApproachChannel] = useState<"call" | "whatsapp" | "email">("call");
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const [waContactName, setWaContactName] = useState("");
  const [waProductId, setWaProductId] = useState<number | undefined>();

  const clientDisplayName = initialClient.trade_name || initialClient.legal_name || "Cliente";
  const primaryContact = contacts[0];
  const primaryPhone = contacts.map((c) => c.phone).find(Boolean) ?? null;
  const primaryWhatsapp = contacts.map((c) => c.whatsapp || c.phone).find(Boolean) ?? null;
  const primaryEmail = contacts.map((c) => c.email).find(Boolean) ?? null;
  const tel = primaryPhone ? telLink(primaryPhone) : primaryWhatsapp ? telLink(primaryWhatsapp) : null;
  const mail = primaryEmail ? mailtoLink(primaryEmail) : null;

  useEffect(() => {
    if (followUpId) setApproachOpen(true);
  }, [followUpId]);

  useEffect(() => {
    if (openMeetingForm) setMeetingOpen(true);
  }, [openMeetingForm]);

  useEffect(() => {
    setOppList(opportunities);
  }, [opportunities]);

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

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{initialClient.trade_name || initialClient.legal_name || "Cliente"}</h1>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            setApproachChannel("call");
            setApproachOpen(true);
          }}
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
        <button className="btn" type="button" onClick={() => setNewOppProductId(String(linkedProducts[0]?.product_id ?? ""))}>
          Nova oportunidade
        </button>
        {tel ? (
          <a className="btn" href={tel}>
            Ligar
          </a>
        ) : null}
        {primaryWhatsapp ? (
          <button
            className="btn"
            type="button"
            onClick={() => {
              setWaPhone(primaryWhatsapp);
              setWaContactName(primaryContact?.name ?? "");
              setWaProductId(linkedProducts[0]?.product_id);
              setWaOpen(true);
            }}
          >
            WhatsApp
          </button>
        ) : null}
        {mail ? (
          <a className="btn" href={mail}>
            E-mail
          </a>
        ) : null}
        <button
          className="btn"
          type="button"
          onClick={() => {
            setApproachChannel("whatsapp");
            setApproachOpen(true);
          }}
        >
          Registrar WhatsApp
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setApproachChannel("email");
            setApproachOpen(true);
          }}
        >
          Registrar e-mail
        </button>
      </div>

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
        defaultChannel={approachChannel}
        defaultContactId={primaryContact?.id}
        defaultProductId={linkedProducts[0]?.product_id}
        followUpId={followUpId}
      />
      <WhatsAppTemplateModal
        open={waOpen}
        onClose={() => setWaOpen(false)}
        phone={waPhone}
        productId={waProductId}
        vars={{
          contato_nome: waContactName,
          cliente_nome: clientDisplayName,
          produto_nome: linkedProducts.find((p) => p.product_id === waProductId)?.name ?? linkedProducts[0]?.name
        }}
      />

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Empresa</h3>
        <p>
          <span className="muted">CNPJ:</span> {formatCnpj(initialClient.cnpj) || "—"}
        </p>
        <p>
          <span className="muted">Razão social:</span> {initialClient.legal_name || "—"}
        </p>
        <p>
          <span className="muted">Segmento:</span> {initialClient.segment || "—"}
        </p>
        <p>
          <span className="muted">Local:</span> {[initialClient.city, initialClient.uf].filter(Boolean).join(" / ") || "—"}
        </p>
        <p>
          <span className="muted">Endereço:</span> {initialClient.address || "—"}
        </p>
        <p>
          <span className="muted">Site:</span> {initialClient.website || "—"}
        </p>
        <p>
          <span className="muted">Instagram:</span> {initialClient.instagram || "—"}
        </p>
        <p>
          <span className="muted">BDR:</span> {bdr?.name ?? "—"}
        </p>
        <p>
          <span className="muted">Produtos:</span> {linkedProducts.map((p) => p.name).join(", ") || "—"}
        </p>
        {initialClient.notes ? (
          <p>
            <span className="muted">Observações:</span> {initialClient.notes}
          </p>
        ) : null}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Oportunidades</h3>
        {oppList.length === 0 ? <p className="muted">Nenhuma negociação registrada.</p> : null}
        <ul style={{ paddingLeft: "1.1rem" }}>
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
        <div className="filters-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="label">Produto</label>
            <select className="select" value={newOppProductId} onChange={(e) => setNewOppProductId(e.target.value)}>
              <option value="">—</option>
              {(linkedProducts.length ? linkedProducts : allProducts.map((p) => ({ product_id: p.id, name: p.name }))).map((p) => (
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
          <button type="button" className="btn btn-primary" onClick={() => void createOpportunity(false)}>
            Criar oportunidade
          </button>
        </div>
        {dupOpen ? (
          <div className="alert" style={{ marginTop: 12 }}>
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
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Contatos</h3>
        {contacts.length === 0 ? <p className="muted">Nenhum contato cadastrado.</p> : null}
        <form onSubmit={addContact} style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
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
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Histórico</h3>
        <ClientTimeline clientId={initialClient.id} />
      </div>
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
      {contact.verification_status === "confirmed" ? (
        <span className="badge badge-verified">Verificado</span>
      ) : null}
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
