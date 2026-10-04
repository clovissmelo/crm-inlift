"use client";

type ProfileOption = { id: number; name: string; access_rank: number; active: boolean };

export function UserAccessProfilePicker({
  options,
  selectedIds,
  onChange,
  disabled
}: {
  options: ProfileOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const selectedSet = new Set(selectedIds);

  function toggle(id: number) {
    if (disabled) return;
    onChange(selectedSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const activeOptions = options.filter((o) => o.active);

  return (
    <div className="user-access-profile-picker">
      <div className="user-role-picker-head">
        <span className="label" style={{ margin: 0 }}>
          Perfis de acesso ao menu
        </span>
        <span className="muted user-role-picker-meta">
          {selectedIds.length === 0
            ? "Nenhum — usa menu padrão do CRM"
            : `${selectedIds.length} perfil(is) — prevalece o de maior nível`}
        </span>
      </div>
      {activeOptions.length === 0 ? (
        <p className="muted" style={{ fontSize: "0.8125rem" }}>
          Cadastre perfis em Admin → Perfis e acessos.
        </p>
      ) : (
        <ul className="user-access-profile-grid">
          {activeOptions.map((p) => {
            const on = selectedSet.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`user-role-card${on ? " is-selected" : ""}`}
                  disabled={disabled}
                  onClick={() => toggle(p.id)}
                  aria-pressed={on}
                >
                  <strong>{p.name}</strong>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>
                    Nível {p.access_rank}
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
