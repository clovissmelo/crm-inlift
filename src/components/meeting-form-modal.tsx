"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CadastroModal } from "@/components/cadastro-ui";
import { defaultMeetingDateYmd, meetingDefaultTitle, SpDatePicker } from "@/components/sp-date-picker";
import { formatYmdInSp } from "@/lib/calendar-range";
import { spLocalDateTimeToIso } from "@/lib/datetime";
import { MEETING_STATUS_LABELS, type MeetingStatus } from "@/lib/meeting-constants";
import type { Product, User } from "@/lib/types";
import type { ClientContact } from "@/components/client-detail-view";

type InternalParticipant = { id: number; name: string; email: string };

type Conflict = { id: number; title: string; starts_at: string; duration_minutes: number; user_name: string };

export function MeetingFormModal({
  open,
  onClose,
  onSaved,
  clientId,
  clientName,
  contacts,
  products,
  bdrs,
  allUsers,
  defaultBdrUserId,
  defaultProductId,
  defaultContactId,
  defaultOpportunityId,
  meetingId
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (meetingId: number) => void;
  clientId: number;
  clientName: string;
  contacts: ClientContact[];
  products: Product[];
  bdrs: User[];
  allUsers: User[];
  defaultBdrUserId?: number | null;
  defaultProductId?: number;
  defaultContactId?: number;
  defaultOpportunityId?: number;
  meetingId?: number;
}) {
  const [title, setTitle] = useState("");
  const [productId, setProductId] = useState("");
  const [contactId, setContactId] = useState("");
  const [bdrUserId, setBdrUserId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(30);
  const [status, setStatus] = useState<MeetingStatus>("scheduled");
  const [notes, setNotes] = useState("");
  const [internal, setInternal] = useState<InternalParticipant[]>([]);
  const [extraUserId, setExtraUserId] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externals, setExternals] = useState<Array<{ email: string; display_name: string | null; contact_id: number | null }>>([]);
  const [googleStatus, setGoogleStatus] = useState<{ configured: boolean; connected: boolean; message?: string | null } | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [confirmConflicts, setConfirmConflicts] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [summary, setSummary] = useState("");
  const [interestNotes, setInterestNotes] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [resolvedContacts, setResolvedContacts] = useState(contacts);
  const [titleTouched, setTitleTouched] = useState(false);
  const minDateYmd = formatYmdInSp();

  useEffect(() => {
    if (!open) return;
    if (contacts.length) {
      setResolvedContacts(contacts);
      return;
    }
    void fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d as { contacts?: ClientContact[] }).contacts ?? [];
        setResolvedContacts(list);
      });
  }, [open, clientId, contacts]);

  const selectedContact = resolvedContacts.find((c) => String(c.id) === contactId);

  const resetCreateDefaults = useCallback(() => {
    const pid = defaultProductId ? String(defaultProductId) : "";
    setProductId(pid);
    setTitleTouched(false);
    setTitle(meetingDefaultTitle(pid, clientName, products));
    setContactId(defaultContactId ? String(defaultContactId) : resolvedContacts[0]?.id ? String(resolvedContacts[0].id) : "");
    setBdrUserId(defaultBdrUserId ? String(defaultBdrUserId) : bdrs[0]?.id ? String(bdrs[0].id) : "");
    setDate(defaultMeetingDateYmd());
    setTime("");
    setDuration(30);
    setStatus("scheduled");
    setNotes("");
    setExternals([]);
    setExternalEmail("");
    setExternalName("");
    setConflicts([]);
    setConfirmConflicts(false);
    setCancelReason("");
    setRescheduleReason("");
    setSummary("");
    setInterestNotes("");
    setNextStep("");
    setError(null);
  }, [bdrs, clientName, products, resolvedContacts, defaultBdrUserId, defaultContactId, defaultProductId]);

  useEffect(() => {
    if (!open || meetingId || titleTouched) return;
    setTitle(meetingDefaultTitle(productId, clientName, products));
  }, [open, meetingId, titleTouched, productId, clientName, products]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/integrations/google")
      .then((r) => r.json())
      .then((d) => setGoogleStatus(d as typeof googleStatus));
  }, [open]);

  useEffect(() => {
    if (!open || meetingId) return;
    resetCreateDefaults();
  }, [open, meetingId, resetCreateDefaults]);

  useEffect(() => {
    if (!open || meetingId) return;
    const bdr = bdrUserId ? Number(bdrUserId) : null;
    if (!bdr) return;
    const params = new URLSearchParams({ bdr_user_id: String(bdr) });
    if (productId) params.set("product_id", productId);
    void fetch(`/api/meetings/suggest-participants?${params}`)
      .then((r) => r.json())
      .then((d) => setInternal((d as { participants: InternalParticipant[] }).participants ?? []));
  }, [open, meetingId, productId, bdrUserId]);

  useEffect(() => {
    if (!open || !meetingId) return;
    void (async () => {
      setLoading(true);
      const res = await fetch(`/api/meetings/${meetingId}`);
      if (!res.ok) {
        setError("Não foi possível carregar a reunião.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        meeting: Record<string, unknown>;
        internal_participants: InternalParticipant[];
        external_participants: Array<{ email: string; display_name: string | null; contact_id: number | null }>;
      };
      const m = data.meeting;
      setTitle(String(m.title ?? ""));
      setProductId(m.product_id ? String(m.product_id) : "");
      setContactId(m.contact_id ? String(m.contact_id) : "");
      setBdrUserId(String(m.bdr_user_id ?? ""));
      const starts = String(m.starts_at ?? "");
      if (starts) {
        const d = new Date(starts);
        const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
        const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
        setDate(dateFmt.format(d));
        setTime(timeFmt.format(d));
      }
      setDuration(Number(m.duration_minutes ?? 30));
      setStatus((m.status as MeetingStatus) ?? "scheduled");
      setNotes(String(m.notes ?? ""));
      setSummary(String(m.summary ?? ""));
      setInterestNotes(String(m.interest_notes ?? ""));
      setNextStep(String(m.next_step ?? ""));
      setInternal(data.internal_participants ?? []);
      setExternals(data.external_participants ?? []);
      setLoading(false);
    })();
  }, [open, meetingId]);

  useEffect(() => {
    if (!open || meetingId) return;
    if (selectedContact?.email) {
      setExternals([{ email: selectedContact.email, display_name: selectedContact.name, contact_id: selectedContact.id }]);
    } else {
      setExternals([]);
    }
  }, [open, meetingId, contactId, selectedContact?.email, selectedContact?.id, selectedContact?.name]);

  const noExternalEmail = !externals.length;

  const externalPreview = useMemo(
    () => externals.map((e) => `${e.display_name ? `${e.display_name} ` : ""}<${e.email}>`).join(", "),
    [externals]
  );

  function removeInternal(id: number) {
    setInternal((list) => list.filter((p) => p.id !== id));
  }

  function addInternal() {
    const uid = Number(extraUserId);
    if (!uid) return;
    const u = allUsers.find((x) => x.id === uid);
    if (!u || internal.some((p) => p.id === uid)) return;
    setInternal((list) => [...list, { id: u.id, name: u.name, email: u.email }]);
    setExtraUserId("");
  }

  function addExternal() {
    const email = externalEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Informe um e-mail externo válido.");
      return;
    }
    if (externals.some((e) => e.email === email)) return;
    setExternals((list) => [
      ...list,
      { email, display_name: externalName.trim() || null, contact_id: contactId ? Number(contactId) : null }
    ]);
    setExternalEmail("");
    setExternalName("");
    setError(null);
  }

  async function checkConflicts(startsAt: string): Promise<Conflict[]> {
    const ids = internal.map((p) => p.id);
    if (!ids.length) return [];
    const params = new URLSearchParams({
      starts_at: startsAt,
      duration_minutes: String(duration),
      user_ids: ids.join(",")
    });
    if (meetingId) params.set("exclude_meeting_id", String(meetingId));
    const res = await fetch(`/api/meetings/conflicts?${params}`);
    if (!res.ok) return [];
    return ((await res.json()) as { conflicts: Conflict[] }).conflicts ?? [];
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date || !time) {
      setError("Informe data e horário (fuso America/Sao_Paulo).");
      return;
    }
    if (!meetingId && date < minDateYmd) {
      setError("Selecione uma data a partir de hoje.");
      return;
    }
    if (!internal.length) {
      setError("Inclua ao menos um participante interno.");
      return;
    }
    const startsAt = spLocalDateTimeToIso(date, time);

    if (!confirmConflicts) {
      const found = await checkConflicts(startsAt);
      if (found.length) {
        setConflicts(found);
        setError("Há outro agendamento no mesmo horário para um dos participantes. Revise e confirme para continuar.");
        return;
      }
    }

    setLoading(true);
    const payload = {
      client_id: clientId,
      product_id: productId ? Number(productId) : null,
      contact_id: contactId ? Number(contactId) : null,
      opportunity_id: defaultOpportunityId ?? null,
      bdr_user_id: Number(bdrUserId),
      title: title.trim(),
      starts_at: startsAt,
      duration_minutes: duration,
      status,
      notes: notes || null,
      internal_user_ids: internal.map((p) => p.id),
      external_participants: externals,
      confirm_conflicts: confirmConflicts,
      idempotency_key: idempotencyKey
    };

    let res: Response;
    if (meetingId) {
      const patch: Record<string, unknown> = {
        title: payload.title,
        starts_at: payload.starts_at,
        duration_minutes: payload.duration_minutes,
        status,
        notes: payload.notes,
        internal_user_ids: payload.internal_user_ids,
        external_participants: payload.external_participants,
        confirm_conflicts: confirmConflicts,
        summary: summary || null,
        interest_notes: interestNotes || null,
        next_step: nextStep || null
      };
      if (status === "cancelled") patch.cancel_reason = cancelReason || null;
      if (rescheduleReason) patch.reschedule_reason = rescheduleReason;
      res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
    } else {
      res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload)
      });
    }

    const data = (await res.json()) as { error?: string; meetingId?: number; meeting?: { id?: number }; google?: { ok: boolean; error?: string } };
    setLoading(false);

    if (res.status === 409) {
      setConflicts((data as { conflicts?: Conflict[] }).conflicts ?? []);
      setError(data.error ?? "Conflito de horário");
      return;
    }
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }

    const savedId = meetingId ?? data.meetingId ?? data.meeting?.id;
    onSaved?.(savedId ?? 0);
    onClose();
    window.location.reload();
  }

  const formBody = (
      <form onSubmit={submit}>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {conflicts.length ? (
          <div className="alert" style={{ marginBottom: 12 }}>
            <strong>Conflitos de horário:</strong>
            <ul style={{ margin: "8px 0" }}>
              {conflicts.map((c) => (
                <li key={`${c.id}-${c.user_name}`}>
                  {c.user_name}: {c.title} ({new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(c.starts_at))})
                </li>
              ))}
            </ul>
            <label style={{ display: "flex", gap: 8 }}>
              <input type="checkbox" checked={confirmConflicts} onChange={(e) => setConfirmConflicts(e.target.checked)} />
              Prosseguir mesmo assim
            </label>
          </div>
        ) : null}

        <div className="field">
          <label className="label">Título</label>
          <input
            className="input"
            value={title}
            onChange={(e) => {
              setTitleTouched(true);
              setTitle(e.target.value);
            }}
            required
          />
        </div>
        <div className="filters-row">
          <div className="field">
            <label className="label">Produto</label>
            <select
              className="select"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                if (!meetingId && !titleTouched) {
                  setTitle(meetingDefaultTitle(e.target.value, clientName, products));
                }
              }}
            >
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Contato</label>
            <select className="select" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {resolvedContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email ? ` (${c.email})` : " (sem e-mail)"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">BDR responsável</label>
            <select className="select" value={bdrUserId} onChange={(e) => setBdrUserId(e.target.value)} required>
              {bdrs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="filters-row">
          <div className="field sp-date-picker-field">
            <label className="label">Data (SP)</label>
            <SpDatePicker value={date} onChange={setDate} minYmd={meetingId ? undefined : minDateYmd} />
          </div>
          <div className="field">
            <label className="label">Início (SP)</label>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">Duração (min)</label>
            <input className="input" type="number" min={5} max={480} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="label">Situação</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus)}>
              {(Object.keys(MEETING_STATUS_LABELS) as MeetingStatus[]).map((s) => (
                <option key={s} value={s}>
                  {MEETING_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <span className="label">Participantes internos</span>
          <ul style={{ margin: "0 0 8px", paddingLeft: "1.1rem" }}>
            {internal.map((p) => (
              <li key={p.id}>
                {p.name} — {p.email}{" "}
                <button type="button" className="btn" style={{ padding: "2px 8px", marginLeft: 8 }} onClick={() => removeInternal(p.id)}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <div className="filters-row">
            <select className="select" value={extraUserId} onChange={(e) => setExtraUserId(e.target.value)}>
              <option value="">Adicionar usuário…</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={addInternal}>
              Incluir
            </button>
          </div>
        </div>

        <div className="field">
          <span className="label">Convidados externos (e-mail do convite)</span>
          {noExternalEmail ? (
            <p className="alert" style={{ fontSize: "0.9rem" }}>
              Nenhum e-mail externo — a BDR precisará compartilhar o link da reunião por outro canal (WhatsApp, telefone, etc.).
            </p>
          ) : (
            <p className="muted">Serão convidados: {externalPreview}</p>
          )}
          <ul style={{ margin: "0 0 8px", paddingLeft: "1.1rem" }}>
            {externals.map((e) => (
              <li key={e.email}>
                {e.display_name ? `${e.display_name} ` : ""}
                {e.email}{" "}
                <button
                  type="button"
                  className="btn"
                  style={{ padding: "2px 8px" }}
                  onClick={() => setExternals((list) => list.filter((x) => x.email !== e.email))}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <div className="filters-row">
            <input className="input" placeholder="E-mail" value={externalEmail} onChange={(e) => setExternalEmail(e.target.value)} />
            <input className="input" placeholder="Nome (opcional)" value={externalName} onChange={(e) => setExternalName(e.target.value)} />
            <button type="button" className="btn" onClick={addExternal}>
              Adicionar externo
            </button>
          </div>
        </div>

        <div className="field">
          <label className="label">Observações</label>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {status === "cancelled" ? (
          <div className="field">
            <label className="label">Motivo do cancelamento</label>
            <textarea className="textarea" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} required />
          </div>
        ) : null}

        {meetingId ? (
          <div className="field">
            <label className="label">Motivo do reagendamento (se alterou data/hora)</label>
            <textarea className="textarea" value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} />
          </div>
        ) : null}

        {status === "held" || summary || interestNotes || nextStep ? (
          <>
            <h4>Após a reunião</h4>
            <div className="field">
              <label className="label">Resumo</label>
              <textarea className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Interesse demonstrado</label>
              <textarea className="textarea" value={interestNotes} onChange={(e) => setInterestNotes(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Próximo passo</label>
              <textarea className="textarea" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
            </div>
          </>
        ) : null}

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Salvando…" : "Salvar reunião"}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
  );

  if (!open) return null;

  return (
    <CadastroModal open={open} title={`${meetingId ? "Editar reunião" : "Agendar reunião"} — ${clientName}`} onClose={onClose} wide>
      {googleStatus ? (
        <p className="muted" style={{ marginTop: 0 }}>
          {googleStatus.connected
            ? "Google Agenda conectado — o convite será sincronizado ao salvar."
            : googleStatus.message ?? "Google Agenda não conectado — a reunião será salva apenas no FUNON."}
        </p>
      ) : null}
      {formBody}
    </CadastroModal>
  );
}
