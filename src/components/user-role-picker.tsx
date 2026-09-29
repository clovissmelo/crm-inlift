"use client";

import { ROLE_LABELS, type UserRole } from "@/lib/types";

const ALL_ROLES: UserRole[] = ["bdr", "product_owner", "manager", "admin"];

const ROLE_HINTS: Record<UserRole, string> = {
  bdr: "Prospecção, abordagens e funil",
  product_owner: "Dono de produto e empresa",
  manager: "Visão gerencial e equipe",
  admin: "Configurações e cadastros"
};

type Props = {
  selected: UserRole[];
  onChange: (roles: UserRole[]) => void;
  disabled?: boolean;
};

export function UserRolePicker({ selected, onChange, disabled }: Props) {
  const selectedSet = new Set(selected);

  function toggle(role: UserRole) {
    if (disabled) return;
    onChange(selectedSet.has(role) ? selected.filter((r) => r !== role) : [...selected, role]);
  }

  return (
    <div className="user-role-picker">
      <div className="user-role-picker-head">
        <span className="label" style={{ margin: 0 }}>
          Perfis
        </span>
        <span className="muted user-role-picker-meta">
          {selected.length === 0 ? "Selecione ao menos um perfil" : `${selected.length} ativo${selected.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {selected.length > 0 ? (
        <ul className="product-owner-chips" aria-label="Perfis selecionados">
          {selected.map((role) => (
            <li key={role}>
              <button type="button" className="product-owner-chip" disabled={disabled} onClick={() => toggle(role)}>
                {ROLE_LABELS[role]}
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
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
      </ul>
    </div>
  );
}
