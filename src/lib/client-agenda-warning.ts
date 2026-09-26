import { formatSpDateTime } from "@/lib/datetime";

export type ClientAgendaItem = {
  kind: "meeting" | "return";
  id: number;
  label: string;
  scheduled_at: string;
};

export async function fetchClientUpcomingAgendas(clientId: number): Promise<ClientAgendaItem[]> {
  const res = await fetch(`/api/clients/${clientId}/upcoming-agendas`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: ClientAgendaItem[] };
  return data.items ?? [];
}

/** Retorna false se o usuário cancelar por já existir agenda. */
export async function confirmProceedIfClientHasAgenda(clientId: number): Promise<boolean> {
  const items = await fetchClientUpcomingAgendas(clientId);
  if (items.length === 0) return true;

  const lines = items
    .map((i) => {
      const tipo = i.kind === "meeting" ? "Reunião" : "Retorno";
      return `• ${tipo}: ${i.label} — ${formatSpDateTime(i.scheduled_at)}`;
    })
    .join("\n");

  return window.confirm(
    `Este lead já possui agenda:\n\n${lines}\n\nDeseja prosseguir mesmo assim?`
  );
}
