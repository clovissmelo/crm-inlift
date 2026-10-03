"use client";

type Props = {
  mode: "return" | "meeting";
  nextDate: string;
  nextTime: string;
  onNextDateChange: (v: string) => void;
  onNextTimeChange: (v: string) => void;
  invalidSchedule?: boolean;
};

export function ApproachMinimalScheduleField({
  mode,
  nextDate,
  nextTime,
  onNextDateChange,
  onNextTimeChange,
  invalidSchedule
}: Props) {
  const title = mode === "meeting" ? "Agendar reunião" : "Agendar contato (retorno)";
  const hint =
    mode === "meeting"
      ? "Este resultado exige data e hora na agenda de reuniões."
      : "Informe quando retornar o contato. O lead volta à fila de prospecção na data.";

  return (
    <div className={invalidSchedule ? "field field--invalid" : "field"}>
      <label className="label">{title} *</label>
      <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 6px" }}>
        {hint}
      </p>
      <div className="call-reg-schedule-row">
        <input className="input" type="date" value={nextDate} onChange={(e) => onNextDateChange(e.target.value)} required />
        <input className="input" type="time" value={nextTime} onChange={(e) => onNextTimeChange(e.target.value)} required />
      </div>
      {invalidSchedule ? <p className="call-reg-invalid-hint">Informe data e hora.</p> : null}
    </div>
  );
}
