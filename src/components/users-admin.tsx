"use client";

import { useEffect, useState } from "react";
import { Api4comBdrFields } from "@/components/api4com-bdr-fields";
import { CadastroModal, CadastroPageHeader, CadastroRowActions, requestCadastroDelete } from "@/components/cadastro-ui";
import { UserRolePicker } from "@/components/user-role-picker";
import type { Api4comTokenPolicy } from "@/lib/api4com/token-policy-shared";
import { ROLE_LABELS, type User, type UserRole } from "@/lib/types";

type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  status: "active" | "inactive";
  roles: UserRole[];
  access_profile_ids: number[];
  api4com_extension: string;
  api4com_api_token: string;
};

function formHasBdrRole(
  profileIds: number[],
  options: Array<{ id: number; administrative_roles?: UserRole[] }>,
  legacyRoles: UserRole[]
) {
  if (legacyRoles.includes("bdr")) return true;
  return profileIds.some((id) => options.find((p) => p.id === id)?.administrative_roles?.includes("bdr"));
}

const emptyForm = (): UserForm => ({
  name: "",
  email: "",
  phone: "",
  password: "",
  status: "active",
  roles: [] as UserRole[],
  access_profile_ids: [],
  api4com_extension: "",
  api4com_api_token: ""
});

export function UsersAdmin({ canDelete = false }: { canDelete?: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editingHasApiToken, setEditingHasApiToken] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [api4comTokenPolicy, setApi4comTokenPolicy] = useState<Api4comTokenPolicy>("global");
  const [accessProfileOptions, setAccessProfileOptions] = useState<
    Array<{ id: number; name: string; access_rank: number; active: boolean; administrative_roles?: UserRole[] }>
  >([]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/users");
    const data = (await res.json()) as { users: User[] };
    setUsers(data.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    void fetch("/api/api4com/token-policy")
      .then((r) => r.json())
      .then((d: { policy?: Api4comTokenPolicy }) => setApi4comTokenPolicy(d.policy === "per_bdr" ? "per_bdr" : "global"))
      .catch(() => null);
    void fetch("/api/admin/access-profiles")
      .then((r) => r.json())
      .then(
        (d: {
          profiles?: Array<{
            id: number;
            name: string;
            access_rank: number;
            active: boolean;
            administrative_roles?: UserRole[];
          }>;
        }) => setAccessProfileOptions(d.profiles ?? [])
      )
      .catch(() => null);
  }, []);

  function openCreate() {
    setEditingId(null);
    setEditingHasApiToken(false);
    setChangingPassword(false);
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  }

  function openEdit(user: User) {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      password: "",
      status: user.status,
      roles: [...user.roles],
      access_profile_ids: [...(user.access_profile_ids ?? [])],
      api4com_extension: user.api4com_extension ?? "",
      api4com_api_token: ""
    });
    setEditingHasApiToken(Boolean(user.has_api4com_api_token));
    setChangingPassword(false);
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setChangingPassword(false);
    setForm(emptyForm());
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const effectiveBdr = formHasBdrRole(form.access_profile_ids, accessProfileOptions, form.roles);

    const payload: Record<string, unknown> = {
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      status: form.status,
      access_profile_ids: form.access_profile_ids,
      api4com_extension: effectiveBdr ? form.api4com_extension.trim() || null : null
    };
    if (api4comTokenPolicy === "per_bdr" && effectiveBdr && form.api4com_api_token.trim()) {
      payload.api4com_api_token = form.api4com_api_token.trim();
    }
    if (form.password.trim()) payload.password = form.password;

    if (form.access_profile_ids.length === 0) {
      setError("Selecione ao menos um perfil de acesso.");
      setSaving(false);
      return;
    }

    if (!editingId) {
      if (!form.password.trim()) {
        setError("Informe a senha inicial.");
        setSaving(false);
        return;
      }
      payload.password = form.password;
    }

    const url = editingId ? `/api/users/${editingId}` : "/api/users";
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

  async function removeUser(target: User) {
    if (!(await requestCadastroDelete(target.name))) return;
    setError(null);
    const res = await fetch(`/api/users/${target.id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Erro ao excluir");
      return;
    }
    if (editingId === target.id) closeModal();
    void load();
  }

  return (
    <div>
      <CadastroPageHeader title="Usuários" onNew={openCreate} newLabel="Novo usuário" />

      {error && !modalOpen ? <div className="alert alert-error">{error}</div> : null}

      <div className="panel table-wrap">
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && users.length === 0 ? <p className="muted">Nenhum usuário cadastrado.</p> : null}
        {users.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfis</th>
                <th>Situação</th>
                <th style={{ width: canDelete ? 180 : 100 }} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    {(u.access_profile_ids ?? [])
                      .map((id) => accessProfileOptions.find((p) => p.id === id)?.name ?? `#${id}`)
                      .join(", ") || u.roles.map((r) => ROLE_LABELS[r]).join(", ") || "—"}
                  </td>
                  <td>{u.status === "active" ? "Ativo" : "Inativo"}</td>
                  <td>
                    <CadastroRowActions
                      canDelete={canDelete}
                      onEdit={() => openEdit(u)}
                      onDelete={() => removeUser(u)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <CadastroModal open={modalOpen} title={editingId ? "Editar usuário" : "Novo usuário"} onClose={closeModal} wide>
        <form className="product-form" onSubmit={saveUser}>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <div className="field">
            <label className="label">Nome</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label className="label">E-mail</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="field">
            <label className="label">WhatsApp</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          {editingId ? (
            !changingPassword ? (
              <button
                type="button"
                className="btn"
                style={{ marginBottom: "0.75rem" }}
                onClick={() => setChangingPassword(true)}
              >
                Alterar senha
              </button>
            ) : (
              <div className="field">
                <label className="label">Nova senha</label>
                <input
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setChangingPassword(false);
                    setForm((f) => ({ ...f, password: "" }));
                  }}
                >
                  Cancelar alteração de senha
                </button>
              </div>
            )
          ) : (
            <div className="field">
              <label className="label">Senha inicial</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                autoComplete="new-password"
              />
            </div>
          )}
          <div className="field">
            <label className="label">Situação</label>
            <select className="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          {formHasBdrRole(form.access_profile_ids, accessProfileOptions, form.roles) ? (
            <Api4comBdrFields
              extension={form.api4com_extension}
              onExtensionChange={(v) => setForm((f) => ({ ...f, api4com_extension: v }))}
              apiToken={form.api4com_api_token}
              onApiTokenChange={(v) => setForm((f) => ({ ...f, api4com_api_token: v }))}
              hasApiToken={editingHasApiToken}
              allowPersonalToken={api4comTokenPolicy === "per_bdr"}
            />
          ) : null}
          <UserRolePicker
            disabled={saving}
            accessProfileOptions={accessProfileOptions}
            selectedAccessProfileIds={form.access_profile_ids}
            onAccessProfilesChange={(access_profile_ids) => setForm((f) => ({ ...f, access_profile_ids }))}
          />
          <div className="product-form-actions">
            <button type="button" className="btn" onClick={closeModal}>
              Cancelar
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </CadastroModal>
    </div>
  );
}
