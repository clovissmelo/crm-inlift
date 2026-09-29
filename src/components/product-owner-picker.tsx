"use client";

import { useMemo, useState } from "react";
import type { User } from "@/lib/types";

type Props = {
  users: User[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
};

function isProductOwner(u: User): boolean {
  return u.status === "active" && u.roles.includes("product_owner");
}

export function ProductOwnerPicker({ users, selectedIds, onChange, disabled }: Props) {
  const [query, setQuery] = useState("");

  const owners = useMemo(() => users.filter(isProductOwner), [users]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return owners;
    return owners.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [owners, q]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggle(id: number) {
    if (disabled) return;
    onChange(
      selectedSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    );
  }

  function removeChip(id: number) {
    if (disabled) return;
    onChange(selectedIds.filter((x) => x !== id));
  }

  const selectedUsers = owners.filter((u) => selectedSet.has(u.id));

  return (
    <div className="product-owner-picker">
      <div className="product-owner-picker-head">
        <span className="label" style={{ margin: 0 }}>
          Donos do produto
        </span>
        <span className="muted product-owner-picker-meta">
          {selectedIds.length} selecionado{selectedIds.length === 1 ? "" : "s"} · {owners.length} com perfil
        </span>
      </div>

      {selectedUsers.length > 0 ? (
        <ul className="product-owner-chips" aria-label="Selecionados">
          {selectedUsers.map((u) => (
            <li key={u.id}>
              <button type="button" className="product-owner-chip" disabled={disabled} onClick={() => removeChip(u.id)}>
                {u.name}
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        className="input product-owner-search"
        type="search"
        placeholder="Pesquisar por nome ou e-mail…"
        value={query}
        disabled={disabled || owners.length === 0}
        onChange={(e) => setQuery(e.target.value)}
      />

      {owners.length === 0 ? (
        <p className="muted product-owner-empty">Nenhum usuário ativo com perfil &quot;Responsável por produto&quot;.</p>
      ) : (
        <ul className="product-owner-list ui-scroll">
          {filtered.length === 0 ? (
            <li className="product-owner-list-empty muted">Nenhum resultado para &quot;{query.trim()}&quot;.</li>
          ) : (
            filtered.map((u) => {
              const on = selectedSet.has(u.id);
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    className={`product-owner-row${on ? " is-selected" : ""}`}
                    disabled={disabled}
                    onClick={() => toggle(u.id)}
                  >
                    <span className={`product-owner-check${on ? " is-on" : ""}`} aria-hidden />
                    <span className="product-owner-row-text">
                      <span className="product-owner-name">{u.name}</span>
                      <span className="product-owner-email">{u.email}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
