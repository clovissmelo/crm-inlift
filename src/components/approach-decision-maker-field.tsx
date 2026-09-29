"use client";

type Props = {
  value: boolean | null;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

export function ApproachDecisionMakerField({ value, onChange, disabled }: Props) {
  return (
    <div className="field">
      <span className="label">Pergunta sobre decisor</span>
      <p className="muted" style={{ fontSize: "0.8125rem", margin: "0 0 0.5rem" }}>
        Houve contato com o decisor de compra?
      </p>
      <div className="filters-row" style={{ marginBottom: 0 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="spoke_with_decision_maker"
            checked={value === true}
            disabled={disabled}
            onChange={() => onChange(true)}
          />
          Sim
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="spoke_with_decision_maker"
            checked={value === false}
            disabled={disabled}
            onChange={() => onChange(false)}
          />
          Não
        </label>
      </div>
    </div>
  );
}
