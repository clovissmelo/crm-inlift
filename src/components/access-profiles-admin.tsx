"use client";

import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import type { MenuDefinition, MenuKey } from "@/lib/access-menu";
import { MENU_SECTION_LABELS } from "@/lib/access-menu";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProfileRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  access_rank: number;
  active: boolean;
  menu_keys: MenuKey[];
};

type ProfileForm = {
  name: string;
  description: string;
  access_rank: number;
  active: boolean;
  menu_keys: MenuKey[];
};

const emptyForm = (): ProfileForm => ({
  name: "",
  description: "",
  access_rank: 10,
  active: true,
  menu_keys: ["dashboard", "prospeccao", "clientes"]
});

export function AccessProfilesAdmin() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [menuCatalog, setMenuCatalog] = useState<MenuDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/access-profiles");
    const data = (await res.json()) as {
      profiles?: ProfileRow[];
      menu_catalog?: MenuDefinition[];
      error?: string;
    };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao carregar perfis");
      return;
    }
    setProfiles(data.profiles ?? []);
    setMenuCatalog(data.menu_catalog ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const menuBySection = useMemo(() => {
    const map = new Map<string, MenuDefinition[]>();
    for (const item of menuCatalog) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    return map;
  }, [menuCatalog]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  }

  function openEdit(row: ProfileRow) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      description: row.description,
      access_rank: row.access_rank,
      active: row.active,
      menu_keys: [...row.menu_keys]
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  function toggleMenuKey(key: MenuKey) {
    setForm((f) => {
      const set = new Set(f.menu_keys);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...f, menu_keys: [...set] };
    });
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Informe o nome do perfil.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      access_rank: form.access_rank,
      active: form.active,
      menu_keys: form.menu_keys
    };
    const res = await fetch("/api/admin/access-profiles", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload)
    });
    const data = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }
    setMessage(editingId ? "Perfil atualizado." : "Perfil criado.");
    closeModal();
    void load();
  }

  async function removeProfile(row: ProfileRow) {
    if (!(await requestCadastroDelete(row.name))) return;
    setError(null);
    const res = await fetch(`/api/admin/access-profiles/${row.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Não foi possível excluir");
      return;
    }
    setMessage("Perfil excluído.");
    void load();
  }

  return (
    <div>
      {message && !modalOpen ? <div className="alert alert-info">{message}</div> : null}
      {error && !modalOpen ? <div className="alert alert-error">{error}</div> : null}

      <CadastroPageHeader
        title="Perfis de acesso"
        description="Defina o que cada perfil enxerga no menu. Usuários com vários perfis usam o de maior nível de acesso; empates somam as permissões."
        onNew={openCreate}
        newLabel="Novo perfil"
      />

      <div className="panel table-wrap">
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && profiles.length === 0 ? <p className="muted">Nenhum perfil cadastrado.</p> : null}
        {profiles.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Nível</th>
                <th>Itens de menu</th>
                <th>Situação</th>
                <th style={{ width: 140 }} />
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.description ? (
                      <div className="muted" style={{ fontSize: "0.8125rem" }}>
                        {p.description}
                      </div>
                    ) : null}
                  </td>
                  <td>{p.access_rank}</td>
                  <td className="muted" style={{ fontSize: "0.8125rem" }}>
                    {p.menu_keys.length} item(ns)
                  </td>
                  <td>{p.active ? "Ativo" : "Inativo"}</td>
                  <td>
                    <CadastroRowActions onEdit={() => openEdit(p)} onDelete={() => void removeProfile(p)} canDelete />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <CadastroModal
        open={modalOpen}
        title={editingId ? "Editar perfil de acesso" : "Novo perfil de acesso"}
        onClose={() => !saving && closeModal()}
        wide
      >
        <form onSubmit={saveProfile}>
          {error && modalOpen ? <div className="alert alert-error">{error}</div> : null}
          <div className="field">
            <label className="label" htmlFor="ap-name">
              Nome
            </label>
            <input
              id="ap-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              disabled={saving}
              autoFocus
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="ap-desc">
              Descrição
            </label>
            <textarea
              id="ap-desc"
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              disabled={saving}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="ap-rank">
              Nível de acesso
            </label>
            <input
              id="ap-rank"
              className="input"
              type="number"
              min={0}
              max={9999}
              value={form.access_rank}
              onChange={(e) => setForm((f) => ({ ...f, access_rank: Number(e.target.value) }))}
              disabled={saving}
            />
            <p className="muted" style={{ fontSize: "0.8125rem", marginTop: "0.35rem" }}>
              Quanto maior, mais prioritário quando o usuário tiver mais de um perfil.
            </p>
          </div>
          <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              disabled={saving}
            />
            Ativo
          </label>

          <div className="field" style={{ marginTop: "1rem" }}>
            <span className="label">Acesso ao menu</span>
            {[...menuBySection.entries()].map(([section, items]) => (
              <div key={section} className="access-profile-menu-section">
                <p className="access-profile-menu-section-title">{MENU_SECTION_LABELS[section] ?? section}</p>
                <ul className="access-profile-menu-grid">
                  {items.map((item) => {
                    const checked = form.menu_keys.includes(item.key);
                    return (
                      <li key={item.key}>
                        <label className="access-profile-menu-check">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={saving || Boolean(item.requiresAdminRole)}
                            onChange={() => toggleMenuKey(item.key)}
                          />
                          <span>
                            {item.label}
                            {item.requiresAdminRole ? (
                              <span className="muted" style={{ fontSize: "0.75rem" }}>
                                {" "}
                                (requer função admin)
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={saving} onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </CadastroModal>
    </div>
  );
}
