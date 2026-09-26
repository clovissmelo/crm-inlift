"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CadastroModal, CadastroPageHeader, CadastroRowActions } from "@/components/cadastro-ui";
import { PageIntro } from "@/components/page-intro";
import type { PipelineStageKind } from "@/lib/pipeline-stages";

type Stage = {
  id: number;
  name: string;
  sort_order: number;
  color: string;
  status: "active" | "inactive";
  kind: PipelineStageKind;
};

type StageForm = {
  name: string;
  sort_order: number;
  color: string;
  status: "active" | "inactive";
  kind: PipelineStageKind;
};

const KIND_LABEL: Record<PipelineStageKind, string> = {
  in_progress: "Em andamento (coluna do funil)",
  won: "Convertido (zona de fechamento)",
  lost: "Perdido (zona de fechamento)"
};

const emptyForm = (): StageForm => ({
  name: "",
  sort_order: 50,
  color: "#6366f1",
  status: "active",
  kind: "in_progress"
});

export function PipelineStagesAdmin() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<StageForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Stage | null>(null);
  const [deleteOppCount, setDeleteOppCount] = useState(0);
  const [deleteReassignId, setDeleteReassignId] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/pipeline-stages?all=1");
    const data = (await res.json()) as { items: Stage[] };
    setStages(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inProgressStages = useMemo(
    () => stages.filter((s) => s.kind === "in_progress" && s.status === "active"),
    [stages]
  );

  const reassignOptions = useMemo(() => {
    if (!deleteTarget) return [];
    return inProgressStages.filter((s) => s.id !== deleteTarget.id);
  }, [deleteTarget, inProgressStages]);

  function openCreate() {
    const maxOrder = stages.reduce((m, s) => Math.max(m, s.sort_order), 0);
    setEditingId(null);
    setForm({ ...emptyForm(), sort_order: maxOrder + 10 });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(stage: Stage) {
    setEditingId(stage.id);
    setForm({
      name: stage.name,
      sort_order: stage.sort_order,
      color: stage.color,
      status: stage.status,
      kind: stage.kind
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function saveStage(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = { ...form };
    const url = editingId ? `/api/pipeline-stages/${editingId}` : "/api/pipeline-stages";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    closeModal();
    void load();
  }

  async function openDelete(stage: Stage) {
    setDeleteError(null);
    setDeleteReassignId("");
    setDeleteTarget(stage);
    setDeleteLoading(true);
    const res = await fetch(`/api/pipeline-stages/${stage.id}`);
    const data = (await res.json()) as { opportunities?: number; error?: string };
    setDeleteLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível carregar a etapa");
      setDeleteTarget(null);
      return;
    }
    setDeleteOppCount(data.opportunities ?? 0);
  }

  function closeDelete() {
    setDeleteTarget(null);
    setDeleteOppCount(0);
    setDeleteReassignId("");
    setDeleteError(null);
  }

  async function confirmDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteTarget) return;
    if (deleteOppCount > 0 && !deleteReassignId) {
      setDeleteError("Escolha a etapa de destino para os negócios.");
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    const res = await fetch(`/api/pipeline-stages/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        deleteOppCount > 0 ? { reassign_to_stage_id: Number(deleteReassignId) } : {}
      )
    });
    const data = (await res.json()) as { error?: string };
    setDeleteLoading(false);
    if (!res.ok) {
      setDeleteError(data.error ?? "Erro ao excluir");
      return;
    }
    if (editingId === deleteTarget.id) closeModal();
    closeDelete();
    void load();
  }

  return (
    <div>
      <PageIntro>
        Colunas do funil comercial e zonas Convertido / Perdido. A ordem segue o campo Ordem. Negócios abertos na etapa
        excluída devem ser movidos para outra coluna em andamento.
      </PageIntro>

      <CadastroPageHeader title="Etapas do funil comercial" onNew={openCreate} newLabel="Nova etapa" />

      {error && !modalOpen && !deleteTarget ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel table-wrap">
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && stages.length === 0 ? <p className="muted">Nenhuma etapa cadastrada.</p> : null}
        {stages.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>Cor</th>
                <th>Nome</th>
                <th>Ordem</th>
                <th>Tipo</th>
                <th>Situação</th>
                <th style={{ width: 180 }} />
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span
                      className="pipeline-stage-swatch"
                      style={{ background: s.color }}
                      title={s.color}
                      aria-hidden
                    />
                  </td>
                  <td>{s.name}</td>
                  <td>{s.sort_order}</td>
                  <td>{KIND_LABEL[s.kind]}</td>
                  <td>{s.status === "active" ? "Ativo" : "Inativo"}</td>
                  <td>
                    <CadastroRowActions canDelete onEdit={() => openEdit(s)} onDelete={() => void openDelete(s)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <CadastroModal open={modalOpen} title={editingId ? "Editar etapa" : "Nova etapa"} onClose={closeModal}>
        <form onSubmit={saveStage}>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <div className="field">
            <label className="label">Nome</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label className="label">Ordem</label>
            <input
              className="input"
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              required
            />
          </div>
          <div className="field">
            <label className="label">Cor</label>
            <div className="filters-row" style={{ alignItems: "center" }}>
              <input
                type="color"
                value={form.color.startsWith("#") ? form.color : "#6366f1"}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                aria-label="Cor da etapa"
              />
              <input className="input" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} required />
            </div>
          </div>
          <div className="field">
            <label className="label">Tipo</label>
            <select className="select" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as PipelineStageKind }))}>
              {(Object.keys(KIND_LABEL) as PipelineStageKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Situação</label>
            <select className="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="btn" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </CadastroModal>

      <CadastroModal
        open={deleteTarget !== null}
        title={deleteTarget ? `Excluir “${deleteTarget.name}”` : "Excluir etapa"}
        onClose={closeDelete}
      >
        {deleteLoading && !deleteError ? <p className="muted">Carregando…</p> : null}
        {deleteTarget && !deleteLoading ? (
          <form onSubmit={confirmDelete}>
            {deleteError ? <div className="alert alert-error">{deleteError}</div> : null}
            {deleteOppCount > 0 ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Há <strong>{deleteOppCount}</strong> negócio(s) nesta etapa. Escolha para qual coluna em andamento
                  movê-los antes de excluir.
                </p>
                {reassignOptions.length === 0 ? (
                  <div className="alert alert-error">
                    Crie ou ative outra etapa em andamento antes de excluir esta.
                  </div>
                ) : (
                  <div className="field">
                    <label className="label">Mover negócios para</label>
                    <select
                      className="select"
                      value={deleteReassignId}
                      onChange={(e) => setDeleteReassignId(e.target.value)}
                      required
                    >
                      <option value="">Selecione…</option>
                      {reassignOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                Nenhum negócio está nesta etapa. A exclusão não pode ser desfeita.
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="btn" onClick={closeDelete}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                disabled={deleteLoading || (deleteOppCount > 0 && reassignOptions.length === 0)}
              >
                {deleteLoading ? "Excluindo…" : "Excluir etapa"}
              </button>
            </div>
          </form>
        ) : null}
      </CadastroModal>
    </div>
  );
}
