"use client";

import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import type { AdministrativeRoleDefinition } from "@/lib/access-administrative";
import type { MenuDefinition, MenuKey } from "@/lib/access-menu";
import { ALL_MENU_KEYS, MENU_SECTION_LABELS, MENU_SECTION_ORDER } from "@/lib/access-menu";
import type { UserRole } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProfileRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  access_rank: number;
  active: boolean;
  menu_keys: MenuKey[];
  administrative_roles: UserRole[];
};

type ProfileForm = {
  name: string;
  description: string;
  access_rank: number;
  active: boolean;
  menu_keys: MenuKey[];
  administrative_roles: UserRole[];
};

type EditorTab = "acessos" | "administrativos";

const emptyForm = (): ProfileForm => ({
  name: "",
  description: "",
  access_rank: 10,
  active: true,
  menu_keys: ["dashboard", "prospeccao", "clientes"],
  administrative_roles: ["bdr"]
});

export function AccessProfilesAdmin() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [menuCatalog, setMenuCatalog] = useState<MenuDefinition[]>([]);
  const [adminCatalog, setAdminCatalog] = useState<AdministrativeRoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("acessos");
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
      administrative_roles_catalog?: AdministrativeRoleDefinition[];
      error?: string;
    };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao carregar perfis");
      return;
    }
    setProfiles(data.profiles ?? []);
    setMenuCatalog(data.menu_catalog ?? []);
    setAdminCatalog(data.administrative_roles_catalog ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const adminMenuLocked = form.administrative_roles.includes("admin");
  const allMenuKeys = useMemo(() => menuCatalog.map((m) => m.key), [menuCatalog]);
  const displayMenuKeys = adminMenuLocked ? allMenuKeys.length > 0 ? allMenuKeys : ALL_MENU_KEYS : form.menu_keys;

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
    setEditorTab("acessos");
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
      menu_keys: [...row.menu_keys],
      administrative_roles: [...row.administrative_roles]
    });
    setEditorTab("acessos");
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setEditorTab("acessos");
  }

  function toggleMenuKey(key: MenuKey) {
    if (adminMenuLocked) return;
    setForm((f) => {
      const set = new Set(f.menu_keys);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...f, menu_keys: [...set] };
    });
  }

  function sectionKeys(section: string): MenuKey[] {
    return (menuBySection.get(section) ?? []).map((i) => i.key);
  }

  function sectionState(section: string): "all" | "some" | "none" {
    const keys = sectionKeys(section);
    if (keys.length === 0) return "none";
    const selected = keys.filter((k) => displayMenuKeys.includes(k)).length;
    if (selected === 0) return "none";
    if (selected === keys.length) return "all";
    return "some";
  }

  function toggleSection(section: string) {
    if (adminMenuLocked) return;
    const keys = sectionKeys(section);
    const state = sectionState(section);
    setForm((f) => {
      const set = new Set(f.menu_keys);
      if (state === "all") {
        for (const k of keys) set.delete(k);
      } else {
        for (const k of keys) set.add(k);
      }
      return { ...f, menu_keys: [...set] };
    });
  }

  function toggleAdministrativeRole(role: UserRole) {
    setForm((f) => {
      const set = new Set(f.administrative_roles);
      if (role === "admin") {
        if (set.has("admin")) {
          set.delete("admin");
          return { ...f, administrative_roles: [...set] };
        }
        const keys = allMenuKeys.length > 0 ? allMenuKeys : [...ALL_MENU_KEYS];
        return { ...f, administrative_roles: [...set, "admin"], menu_keys: keys };
      }
      if (set.has(role)) set.delete(role);
      else set.add(role);
      return { ...f, administrative_roles: [...set] };
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
    const menu_keys = adminMenuLocked
      ? allMenuKeys.length > 0
        ? allMenuKeys
        : [...ALL_MENU_KEYS]
      : form.menu_keys;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      access_rank: form.access_rank,
      active: form.active,
      menu_keys,
      administrative_roles: form.administrative_roles
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
        description="Cada perfil define o menu lateral (aba Acessos) e papéis operacionais (aba Administrativos). Atribua perfis em Usuários."
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
                <th>Menu</th>
                <th>Administrativos</th>
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
                  <td className="muted" style={{ fontSize: "0.8125rem" }}>
                    {p.administrative_roles.length > 0 ? `${p.administrative_roles.length} papel(is)` : "—"}
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
            <div className="access-profile-rank-row">
              <div className="access-profile-rank-field">
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
              </div>
              <label className="access-profile-active-check label">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  disabled={saving}
                />
                Ativo
              </label>
            </div>
            <p className="muted" style={{ fontSize: "0.8125rem", marginTop: "0.35rem", marginBottom: 0 }}>
              Quanto maior, mais prioritário.
            </p>
          </div>

          <div className="access-profile-editor-tabs" role="tablist" aria-label="Configuração do perfil">
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === "acessos"}
              className={`access-profile-editor-tab${editorTab === "acessos" ? " is-active" : ""}`}
              onClick={() => setEditorTab("acessos")}
              disabled={saving}
            >
              Acessos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editorTab === "administrativos"}
              className={`access-profile-editor-tab${editorTab === "administrativos" ? " is-active" : ""}`}
              onClick={() => setEditorTab("administrativos")}
              disabled={saving}
            >
              Administrativos
            </button>
          </div>

          {editorTab === "acessos" ? (
            <div className="field" style={{ marginTop: "0.75rem" }} role="tabpanel">
              <span className="label">Menu lateral</span>
              <p className="muted" style={{ fontSize: "0.8125rem", marginTop: 0 }}>
                {adminMenuLocked
                  ? "Perfil Administrador: todos os itens do menu estão liberados."
                  : "Mesma estrutura da barra lateral. Marque a seção inteira ou item a item."}
              </p>
              {MENU_SECTION_ORDER.map((section) => {
                const items = menuBySection.get(section) ?? [];
                if (items.length === 0) return null;
                const state = sectionState(section);
                const sectionLabel = section === "top" ? "Principal" : (MENU_SECTION_LABELS[section] ?? section);
                return (
                  <div key={section} className="access-profile-menu-section">
                    <label className="access-profile-menu-section-head">
                      <input
                        type="checkbox"
                        checked={state === "all"}
                        ref={(el) => {
                          if (el) el.indeterminate = state === "some";
                        }}
                        disabled={saving || adminMenuLocked}
                        onChange={() => toggleSection(section)}
                      />
                      <span className="access-profile-menu-section-title">{sectionLabel}</span>
                    </label>
                    <ul className="access-profile-menu-grid">
                      {items.map((item) => {
                        const checked = displayMenuKeys.includes(item.key);
                        return (
                          <li key={item.key}>
                            <label className="access-profile-menu-check">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={saving || adminMenuLocked}
                                onChange={() => toggleMenuKey(item.key)}
                              />
                              <span>{item.label}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="field" style={{ marginTop: "0.75rem" }} role="tabpanel">
              <span className="label">Papéis administrativos</span>
              <p className="muted" style={{ fontSize: "0.8125rem", marginTop: 0 }}>
                Capacidades operacionais (BDR, dono de produto/empresa, gestor, administrador do sistema).
              </p>
              <ul className="user-role-grid" style={{ marginTop: "0.75rem" }}>
                {(adminCatalog.length > 0 ? adminCatalog : []).map((def) => {
                  const on = form.administrative_roles.includes(def.role);
                  return (
                    <li key={def.role}>
                      <button
                        type="button"
                        className={`user-role-card${on ? " is-selected" : ""}`}
                        disabled={saving}
                        onClick={() => toggleAdministrativeRole(def.role)}
                        aria-pressed={on}
                      >
                        <span className={`product-owner-check${on ? " is-on" : ""}`} aria-hidden />
                        <span className="user-role-card-text">
                          <span className="user-role-card-title">{def.label}</span>
                          <span className="user-role-card-hint">{def.hint}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

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
