/** Rótulos BDR para estado operacional do número (sem expor flags internas). */

export type PhoneDialStatusInput = {
  status: string;
  needs_review?: boolean;
  next_eligible_at?: string | null;
  cycle_no_contact_count?: number;
  cycle_invalid_count?: number;
  verified?: boolean;
  max_no_contact_attempts?: number;
};

export function formatPhoneDialSituation(input: PhoneDialStatusInput, now = Date.now()): string {
  if (input.verified) return "Verificado";
  if (input.status === "exhausted") return "Esgotado";
  if (input.status === "waiting" && input.next_eligible_at) {
    const t = new Date(input.next_eligible_at).getTime();
    if (t > now) return "Aguardando intervalo";
  }
  if (input.needs_review) return "Aguardando revisão";
  if (input.status === "waiting") return "Aguardando retorno/intervalo";
  return "Disponível";
}

export function formatAttemptProgress(input: {
  cycle_no_contact_count: number;
  max_no_contact_attempts: number;
  position: number;
  total: number;
}): string {
  const used = input.cycle_no_contact_count;
  const limit = input.max_no_contact_attempts;
  return `Número ${input.position} de ${input.total} · Sem contato: ${used} de ${limit}`;
}
