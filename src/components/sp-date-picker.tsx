"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { addMonthsYmd, formatYmdInSp, monthGridDays } from "@/lib/calendar-range";

const TZ = "America/Sao_Paulo";

function formatDisplayYmd(ymd: string) {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(d);
}

function formatMonthYear(anchorYmd: string) {
  const d = new Date(`${anchorYmd}T12:00:00-03:00`);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, month: "long", year: "numeric" }).format(d);
}

function isBeforeYmd(a: string, b: string) {
  return a < b;
}

export function SpDatePicker({
  value,
  onChange,
  minYmd,
  id
}: {
  value: string;
  onChange: (ymd: string) => void;
  minYmd?: string;
  id?: string;
}) {
  const min = minYmd ?? formatYmdInSp();
  const enforceMin = Boolean(minYmd);
  const [open, setOpen] = useState(false);
  const [viewYmd, setViewYmd] = useState(value || min);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setViewYmd(value);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const anchorMonth = viewYmd.slice(0, 7);
  const days = useMemo(() => monthGridDays(`${viewYmd.slice(0, 7)}-01`), [viewYmd]);
  const weekdays = ["S", "T", "Q", "Q", "S", "S", "D"]; /* seg → dom */

  function pick(ymd: string) {
    if (enforceMin && isBeforeYmd(ymd, min)) return;
    onChange(ymd);
    setOpen(false);
  }

  return (
    <div className="sp-date-picker" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="sp-date-picker-trigger input"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarDays size={18} aria-hidden className="sp-date-picker-icon" />
        <span>{value ? formatDisplayYmd(value) : "Selecionar data"}</span>
      </button>
      {open ? (
        <div className="sp-date-picker-popover" role="dialog" aria-label="Calendário">
          <div className="sp-date-picker-popover-head">
            <button type="button" className="btn btn-icon-sm" aria-label="Mês anterior" onClick={() => setViewYmd((v) => addMonthsYmd(v, -1))}>
              <ChevronLeft size={18} />
            </button>
            <span className="sp-date-picker-month">{formatMonthYear(`${anchorMonth}-01`)}</span>
            <button type="button" className="btn btn-icon-sm" aria-label="Próximo mês" onClick={() => setViewYmd((v) => addMonthsYmd(v, 1))}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="sp-date-picker-weekdays">
            {weekdays.map((w, i) => (
              <span key={`${w}-${i}`}>{w}</span>
            ))}
          </div>
          <div className="sp-date-picker-grid">
            {days.map((ymd) => {
              const inMonth = ymd.startsWith(anchorMonth);
              const disabled = enforceMin && isBeforeYmd(ymd, min);
              const selected = value === ymd;
              const isToday = ymd === formatYmdInSp();
              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={disabled}
                  className={clsx(
                    "sp-date-picker-day",
                    !inMonth && "is-outside",
                    selected && "is-selected",
                    isToday && "is-today",
                    disabled && "is-disabled"
                  )}
                  onClick={() => pick(ymd)}
                >
                  {Number(ymd.slice(8, 10))}
                </button>
              );
            })}
          </div>
          <div className="sp-date-picker-popover-foot">
            <button type="button" className="btn" onClick={() => pick(min)}>
              Hoje
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function meetingDefaultTitle(productId: string, clientName: string, products: Array<{ id: number; name: string }>) {
  const product = products.find((p) => String(p.id) === productId);
  const productName = product?.name?.trim() || "Produto";
  return `Reunião ${productName} - ${clientName}`;
}

/** Próximo dia útil útil opcional — por ora só garante hoje se vazio */
export function defaultMeetingDateYmd() {
  return formatYmdInSp();
}
