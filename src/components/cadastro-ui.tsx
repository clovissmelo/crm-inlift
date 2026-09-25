"use client";

import type { ReactNode } from "react";

export function CadastroPageHeader({
  title,
  description,
  onNew,
  newLabel = "Novo"
}: {
  title: string;
  description?: string;
  onNew: () => void;
  newLabel?: string;
}) {
  return (
    <div className="cadastro-page-header">
      <div>
        <h1 style={{ margin: 0 }}>{title}</h1>
        {description ? <p className="muted" style={{ margin: "0.35rem 0 0" }}>{description}</p> : null}
      </div>
      <button type="button" className="btn btn-primary" onClick={onNew}>
        {newLabel}
      </button>
    </div>
  );
}

export function CadastroRowActions({
  onEdit,
  onDelete,
  canDelete
}: {
  onEdit: () => void;
  onDelete?: () => void | Promise<void>;
  canDelete?: boolean;
}) {
  return (
    <div className="cadastro-list-actions">
      <button type="button" className="btn" onClick={onEdit}>
        Editar
      </button>
      {canDelete && onDelete ? (
        <button type="button" className="btn btn-danger" onClick={() => void onDelete()}>
          Excluir
        </button>
      ) : null}
    </div>
  );
}

export async function requestCadastroDelete(itemLabel: string) {
  return window.confirm(`Excluir “${itemLabel}”? Esta ação não pode ser desfeita.`);
}

export function CadastroModal({
  open,
  title,
  onClose,
  children,
  wide
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="cadastro-modal-root" role="presentation" onClick={onClose}>
      <div
        className={`cadastro-modal-panel${wide ? " cadastro-modal-panel-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cadastro-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cadastro-modal-head">
          <h2 id="cadastro-modal-title" style={{ margin: 0, fontSize: "1.125rem" }}>
            {title}
          </h2>
          <button type="button" className="btn cadastro-modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="cadastro-modal-body ui-scroll ui-scroll-elevated">{children}</div>
      </div>
    </div>
  );
}
