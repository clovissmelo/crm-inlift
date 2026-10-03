"use client";

import { useEffect } from "react";
import {
  APPROACH_NEXT_ACTION_LABELS,
  defaultNextTypeForResult,
  requiresNonNoneNextStep,
  resolveAllowedNextActions,
  shouldShowNextStepField,
  type ApproachNextActionKey,
  type ApproachResultNextRules
} from "@/lib/approach-next-actions";

export { shouldShowNextStepField };

type ClosureReason = { id: number; name: string; kind: "pause" | "close" };

type Props = {
  result: ApproachResultNextRules | null | undefined;
  nextType: ApproachNextActionKey;
  onNextTypeChange: (value: ApproachNextActionKey) => void;
  nextDate: string;
  nextTime: string;
  onNextDateChange: (v: string) => void;
  onNextTimeChange: (v: string) => void;
  nextNotes?: string;
  onNextNotesChange?: (v: string) => void;
  reasonId?: string;
  onReasonIdChange?: (v: string) => void;
  closureReasons?: ClosureReason[];
  showNotesForSchedule?: boolean;
};

export function useSyncNextTypeWithResult(
  result: ApproachResultNextRules | null | undefined,
  nextType: ApproachNextActionKey,
  setNextType: (v: ApproachNextActionKey) => void
) {
  const resultKey = JSON.stringify({
    id: (result as { id?: number } | null)?.id,
    allowed: result?.allowed_next_actions,
    require: result?.require_schedule_return,
    meeting: result?.requires_meeting,
    suggest: result?.suggest_follow_up
  });
  useEffect(() => {
    if (!result) return;
    const allowed = resolveAllowedNextActions(result);
    const preferred = defaultNextTypeForResult(result);
    if (!allowed.includes(nextType)) setNextType(preferred);
    else if (result.requires_meeting) setNextType("schedule_meeting");
    else if (result.require_schedule_return) setNextType("schedule_return");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when result rules change
  }, [resultKey]);
}

export function ApproachNextStepField({
  result,
  nextType,
  onNextTypeChange,
  nextDate,
  nextTime,
  onNextDateChange,
  onNextTimeChange,
  nextNotes,
  onNextNotesChange,
  reasonId,
  onReasonIdChange,
  closureReasons = [],
  showNotesForSchedule = false,
  invalidSchedule
}: Props & { invalidSchedule?: boolean }) {
  useSyncNextTypeWithResult(result, nextType, onNextTypeChange);

  const allowed = result ? resolveAllowedNextActions(result) : (["none"] as ApproachNextActionKey[]);
  const requireReturn = result?.require_schedule_return === true;
  const requireMeeting = result?.requires_meeting === true;
  const mustPick = result ? requiresNonNoneNextStep(result) : false;

  if (!shouldShowNextStepField(result)) {
    return null;
  }

  return (
    <>
      <div className="field">
        <label className="label">Próximo passo</label>
        {requireMeeting ? (
          <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 6px" }}>
            Este resultado exige agendar uma reunião na agenda.
          </p>
        ) : requireReturn ? (
          <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 6px" }}>
            Este resultado exige agendar retorno.
          </p>
        ) : mustPick ? (
          <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 6px" }}>
            Escolha um próximo passo (Nenhum não é permitido para este resultado).
          </p>
        ) : allowed.length === 1 ? (
          <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 6px" }}>
            Próximo passo fixo para este resultado.
          </p>
        ) : null}
        <select
          className="select"
          value={nextType}
          onChange={(e) => onNextTypeChange(e.target.value as ApproachNextActionKey)}
          disabled={requireReturn || requireMeeting || allowed.length === 1}
        >
          {allowed.map((key) => (
            <option key={key} value={key}>
              {APPROACH_NEXT_ACTION_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      {nextType === "schedule_return" || nextType === "schedule_meeting" ? (
        <div className={invalidSchedule ? "field field--invalid" : "field"}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="input" type="date" value={nextDate} onChange={(e) => onNextDateChange(e.target.value)} required />
            <input className="input" type="time" value={nextTime} onChange={(e) => onNextTimeChange(e.target.value)} required />
          </div>
          {invalidSchedule ? (
            <p className="call-reg-invalid-hint">Informe data e hora.</p>
          ) : null}
          {showNotesForSchedule && onNextNotesChange ? (
            <div className="field">
              <label className="label">Motivo / observação</label>
              <textarea className="textarea" value={nextNotes ?? ""} onChange={(e) => onNextNotesChange(e.target.value)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
