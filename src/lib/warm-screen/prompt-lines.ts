type PromptLine = { text: string; variant?: "dim" | "warn" | "err" | "ok" };

export type WarmScreenPromptPayload = {
  lines: PromptLine[];
  live: boolean;
};

type ItemSlice = {
  client_id: number;
  status: string;
  phone_dialed: string | null;
  error_message: string | null;
  skip_reason: string | null;
};

type CallSlice = {
  status: string | null;
  error_message: string | null;
  result_pending: boolean | null;
};

function header(clientId: number): PromptLine {
  return { text: `C:\\INLIFT>WARM.EXE /client=${clientId}`, variant: "dim" };
}

function formatPhone(phone: string | null) {
  if (!phone) return "—";
  return phone.replace(/\D/g, "");
}

export function buildWarmScreenPrompt(
  item: ItemSlice,
  call: CallSlice | null,
  ctx: { executionStatus: string; queueBlocked: boolean; isCurrent: boolean }
): WarmScreenPromptPayload {
  /** Animação (⋯ / cursor) só enquanto a execução está em andamento. */
  const executionRunning = ctx.executionStatus === "running";
  const live = (animating: boolean) => executionRunning && animating;

  const lines: PromptLine[] = [header(item.client_id)];

  if (ctx.executionStatus === "paused") {
    lines.push({ text: "[||] PAUSE — motor aguardando operador", variant: "warn" });
    return { lines, live: live(true) };
  }

  if (item.status === "pending") {
    if (ctx.queueBlocked) {
      lines.push({ text: "[queue] aguardando ligação anterior", variant: "dim" });
    } else if (ctx.isCurrent) {
      lines.push({ text: "[*] reservando ramal e número", variant: "ok" });
    } else {
      lines.push({ text: "[queue] na fila — standby", variant: "dim" });
    }
    return { lines, live: live(!ctx.queueBlocked || ctx.isCurrent) };
  }

  if (item.status === "dialing") {
    const phone = formatPhone(item.phone_dialed);
    if (!call?.status) {
      lines.push({ text: `[*] discando ${phone}`, variant: "ok" });
      lines.push({ text: "[.] conectando API4COM", variant: "dim" });
      return { lines, live: live(true) };
    }

    switch (call.status) {
      case "initiating":
        lines.push({ text: `[*] discando ${phone}`, variant: "ok" });
        lines.push({ text: "[.] API4COM — iniciando canal", variant: "dim" });
        break;
      case "ringing":
        lines.push({ text: `[~] tocando ${phone}`, variant: "ok" });
        lines.push({ text: "[.] aguardando atendimento", variant: "dim" });
        break;
      case "in_progress":
        lines.push({ text: "[!] ATENDIMENTO detectado", variant: "warn" });
        lines.push({ text: "[*] hangup automático (aquecimento)", variant: "ok" });
        break;
      case "completed":
        if (call.result_pending) {
          lines.push({ text: "[*] ligação encerrada", variant: "dim" });
          lines.push({ text: "[.] registrando abordagem", variant: "ok" });
        } else {
          lines.push({ text: "[OK] triagem concluída", variant: "ok" });
        }
        break;
      case "failed":
        lines.push({
          text: `[X] ${call.error_message ?? item.error_message ?? "falha na ligação"}`,
          variant: "err"
        });
        lines.push({ text: "[.] finalizando item", variant: "dim" });
        break;
      default:
        lines.push({ text: `[?] telefonia: ${call.status}`, variant: "warn" });
    }
    return { lines, live: live(call.status !== "completed" || Boolean(call.result_pending)) };
  }

  if (item.status === "completed_warmed") {
    lines.push({ text: "[OK] lead AQUECIDO — prioridade atualizada", variant: "ok" });
    return { lines, live: false };
  }
  if (item.status === "completed_error") {
    lines.push({ text: "[--] sem aquecimento (não atendeu / ocupado)", variant: "dim" });
    return { lines, live: false };
  }
  if (item.status === "skipped") {
    lines.push({ text: `[skip] ${item.skip_reason ?? "pulado"}`, variant: "warn" });
    return { lines, live: false };
  }
  if (item.status === "failed") {
    lines.push({ text: `[X] ${item.error_message ?? "erro"}`, variant: "err" });
    return { lines, live: false };
  }

  lines.push({ text: `[.] status=${item.status}`, variant: "dim" });
  return { lines, live: false };
}
