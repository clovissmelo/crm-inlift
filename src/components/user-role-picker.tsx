"use client";

import { ROLE_LABELS, type UserRole } from "@/lib/types";

export type AccessProfileOption = {
  id: number;
  name: string;
  access_rank: number;
  active: boolean;
  administrative_roles?: UserRole[];
};

type Props = {
  disabled?: boolean;
  accessProfileOptions: AccessProfileOption[];
  selectedAccessProfileIds: number[];
  onAccessProfilesChange: (ids: number[]) => void;
};

export function UserRolePicker({
  disabled,
  accessProfileOptions = [],
  selectedAccessProfileIds,
  onAccessProfilesChange
}: Props) {
  const accessSelectedSet = new Set(selectedAccessProfileIds);
  const activeAccessOptions = accessProfileOptions.filter((o) => o.active);

  function toggleAccess(id: number) {
    if (disabled) return;
    onAccessProfilesChange(
      accessSelectedSet.has(id)
        ? selectedAccessProfileIds.filter((x) => x !== id)
        : [...selectedAccessProfileIds, id]
    );
  }

  const meta =
    selectedAccessProfileIds.length === 0
      ? "Selecione um ou mais perfis (menu + papéis administrativos)"
      : `${selectedAccessProfileIds.length} perfil(is) · prevalece o maior nível no menu`;

  return (
    <div className="user-role-picker">
      <div className="user-role-picker-head">
        <span className="label" style={{ margin: 0 }}>
          Perfis de acesso
        </span>
        <span className="muted user-role-picker-meta">{meta}</span>
      </div>

      {selectedAccessProfileIds.length > 0 ? (
        <ul className="product-owner-chips" aria-label="Perfis selecionados">
          {selectedAccessProfileIds.map((id) => {
            const p = accessProfileOptions.find((o) => o.id === id);
            if (!p) return null;
            return (
              <li key={id}>
                <button type="button" className="product-owner-chip" disabled={disabled} onClick={() => toggleAccess(id)}>
                  {p.name}
                  <span aria-hidden>×</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {activeAccessOptions.length === 0 ? (
        <p className="muted user-role-picker-footnote">Nenhum perfil ativo — cadastre em Admin → Perfis e acessos.</p>
      ) : (
        <ul className="user-role-grid">
          {activeAccessOptions.map((p) => {
            const on = accessSelectedSet.has(p.id);
            const adminHint =
              p.administrative_roles && p.administrative_roles.length > 0
                ? p.administrative_roles.map((r) => ROLE_LABELS[r]).join(", ")
                : "Sem papéis administrativos";
            return (
              <li key={p.id}>
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
                    <span className="user-role-card-hint">
                      Menu · nível {p.access_rank} · {adminHint}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
