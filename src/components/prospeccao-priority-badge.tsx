import type { ProspeccaoPrioridadeLabel } from "@/lib/prospeccao-priority";

export function ProspeccaoPriorityBadge({ label }: { label: ProspeccaoPrioridadeLabel | string | null }) {
  if (label === "Reagendar") {
    return <span className="badge badge-overdue">Reagendar</span>;
  }
  if (label === "Retorno") {
    return <span className="badge badge-today">Retorno</span>;
  }
  if (label === "Acompanhamento") {
    return <span className="badge badge-acompanhamento">Acompanhamento</span>;
  }
  if (label === "Primeiro contato") {
    return <span className="badge badge-primeiro-contato">Primeiro contato</span>;
  }
  return <span className="badge badge-primeiro-contato">Primeiro contato</span>;
}
