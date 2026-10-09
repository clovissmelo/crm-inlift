export const WARM_SCREEN_PURPOSE = "warm_screen";

export const WARM_SCREEN_MOTOR_LABEL = "Motor de aquecimento de leads.";

/** Intervalo mínimo entre o fim de uma ligação e a próxima tentativa. */
export const WARM_SCREEN_INTERVAL_MS = 15_000;

/** Força encerramento de ligações do motor presas além deste tempo. */
export const WARM_SCREEN_STALE_CALL_MS = 20_000;

/** Ligação atendida no modo assistido — operador conduz roteiro/complemento. */
export const WARM_SCREEN_ASSISTED_STALE_CALL_MS = 2 * 60 * 60 * 1000;

export const WARM_SCREEN_STALE_MESSAGE =
  "Encerrada automaticamente — motor de aquecimento (timeout 20s).";
