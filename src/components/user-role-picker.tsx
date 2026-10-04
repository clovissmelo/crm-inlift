"use client";

import { ROLE_LABELS, type UserRole } from "@/lib/types";

const ALL_ROLES: UserRole[] = ["bdr", "product_owner", "manager", "admin"];

const ROLE_HINTS: Record<UserRole, string> = {
  bdr: "Prospecção, abordagens e funil",
  product_owner: "Dono de produto e empresa",
  manager: "Visão gerencial e equipe",
  admin: "Configurações e cadastros"
};

export type AccessProfileOption = { id: number; name: string; access_rank: number; active: boolean };

type Props = {
  selected: UserRole[];
  onChange: (roles: UserRole[]) => void;
  disabled?: boolean;
  accessProfileOptions?: AccessProfileOption[];
  selectedAccessProfileIds?: number[];
  onAccessProfilesChange?: (ids: number[]) => void;
};

export function UserRolePicker({
  selected,
  onChange,
  disabled,
  accessProfileOptions = [],
  selectedAccessProfileIds = [],
  onAccessProfilesChange
}: Props) {
  const selectedSet = new Set(selected);
  const accessSelectedSet = new Set(selectedAccessProfileIds);
  const activeAccessOptions = accessProfileOptions.filter((o) => o.active);
  const hasAccessPicker = Boolean(onAccessProfilesChange);

  function toggle(role: UserRole) {
    if (disabled) return;
    onChange(selectedSet.has(role) ? selected.filter((r) => r !== role) : [...selected, role]);
  }

  function toggleAccess(id: number) {
    if (disabled || !onAccessProfilesChange) return;
    onAccessProfilesChange(
      accessSelectedSet.has(id)
        ? selectedAccessProfileIds.filter((x) => x !== id)
        : [...selectedAccessProfileIds, id]
    );
  }

  const chipCount = selected.length + selectedAccessProfileIds.length;

  let meta = "";
  if (selected.length === 0) {
    meta = "Selecione ao menos um perfil operacional";
  } else if (!hasAccessPicker || activeAccessOptions.length === 0) {
    meta = `${selected.length} ativo${selected.length === 1 ? "" : "s"}`;
  } else if (selectedAccessProfileIds.length === 0) {
    meta = `${selected.length} operacional(is) · menu padrão do CRM`;
  } else {
    meta = `${selected.length} operacional(is) · ${selectedAccessProfileIds.length} menu (prevalece maior nível)`;
  }

  return (
    <div className="user-role-picker">
      <div className="user-role-picker-head">
        <span className="label" style={{ margin: 0 }}>
          Perfis
        </span>
        <span className="muted user-role-picker-meta">{meta}</span>
      </div>

      {chipCount > 0 ? (
        <ul className="product-owner-chips" aria-label="Perfis selecionados">
          {selected.map((role) => (
            <li key={`role-${role}`}>
              <button type="button" className="product-owner-chip" disabled={disabled} onClick={() => toggle(role)}>
                {ROLE_LABELS[role]}
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
          {hasAccessPicker
            ? selectedAccessProfileIds.map((id) => {
                const p = accessProfileOptions.find((o) => o.id === id);
                if (!p) return null;
                return (
                  <li key={`access-${id}`}>
                    <button
                      type="button"
                      className="product-owner-chip product-owner-chip--menu-access"
                      disabled={disabled}
                      onClick={() => toggleAccess(id)}
                    >
                      {p.name}
                      <span className="product-owner-chip-suffix">menu</span>
                      <span aria-hidden>×</span>
                    </button>
                  </li>
                );
              })
            : null}
        </ul>
      ) : null}

      <ul className="user-role-grid">
        {ALL_ROLES.map((role) => {
          const on = selectedSet.has(role);
          return (
            <li key={role}>
              <button
                type="button"
                className={`user-role-card${on ? " is-selected" : ""}`}
                disabled={disabled}
                onClick={() => toggle(role)}
                aria-pressed={on}
              >
                <span className={`product-owner-check${on ? " is-on" : ""}`} aria-hidden />
                <span className="user-role-card-text">
                  <span className="user-role-card-title">{ROLE_LABELS[role]}</span>
                  <span className="user-role-card-hint">{ROLE_HINTS[role]}</span>
                </span>
              </button>
            </li>
          );
        })}
        {hasAccessPicker
          ? activeAccessOptions.map((p) => {
              const on = accessSelectedSet.has(p.id);
              return (
                <li key={`access-card-${p.id}`}>
                  <button
                    type="button"
                    className={`user-role-card${on ? " is-selected" : ""}`}
                    disabled={disabled}
                    onClick={() => toggleAccess(p.id)}
                    aria-pressed={on}
                  >
                    <span className={`product-owner-check${on ? " is-on" : ""}`} aria-hidden />
                    <span className="user-role-card-text">
                      <span className="user-role-card-title">{p.name}</span>
                      <span className="user-role-card-hint">Acesso ao menu · nível {p.access_rank}</span>
                    </span>
                  </button>
                </li>
              );
            })
          : null}
      </ul>

      {hasAccessPicker && accessProfileOptions.length > 0 && activeAccessOptions.length === 0 ? (
        <p className="muted user-role-picker-footnote">Nenhum perfil de menu ativo — cadastre em Admin → Perfis e acessos.</p>
      ) : null}
    </div>
  );
}
