"use client";

import clsx from "clsx";
import {
  formatDayHeader,
  formatHourLabel,
  formatYmdInSp,
  meetingDayKeyInSp,
  meetingMinutesFromMidnightSp,
  monthGridDays,
  type CalendarRangeKind,
  workWeekDaysFromAnchor
} from "@/lib/calendar-range";
export type CalendarMeeting = {
  id: number;
  title: string;
  starts_at: string;
  duration_minutes: number;
  status: string;
  client_name: string;
};

const HOUR_START = 6;
const HOUR_END = 22;
const HOUR_HEIGHT = 52;

type Props = {
  items: CalendarMeeting[];
  rangeKind: CalendarRangeKind;
  anchorYmd: string;
  onSelect: (id: number) => void;
};

function eventsForDay(items: CalendarMeeting[], ymd: string) {
  return items
    .filter((m) => meetingDayKeyInSp(m.starts_at) === ymd)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function TimeGrid({
  days,
  items,
  onSelect
}: {
  days: string[];
  items: CalendarMeeting[];
  onSelect: (id: number) => void;
}) {
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
  const totalHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT;

  return (
    <div className="meetings-cal-time-grid" style={{ ["--cal-cols" as string]: days.length }}>
      <div className="meetings-cal-corner" />
      {days.map((ymd) => {
        const { weekday, day } = formatDayHeader(ymd);
        const isToday = ymd === formatYmdInSp();
        return (
          <div key={ymd} className={clsx("meetings-cal-day-head", isToday && "is-today")}>
            <span className="meetings-cal-dow">{weekday}</span>
            <span className="meetings-cal-dom">{day}</span>
          </div>
        );
      })}
      <div className="meetings-cal-hours" style={{ height: totalHeight }}>
        {hours.map((h) => (
          <div key={h} className="meetings-cal-hour-label" style={{ height: HOUR_HEIGHT }}>
            {formatHourLabel(h)}
          </div>
        ))}
      </div>
      {days.map((ymd) => {
        const dayEvents = eventsForDay(items, ymd);
        return (
          <div key={ymd} className="meetings-cal-day-col" style={{ height: totalHeight }}>
            {hours.map((h) => (
              <div key={h} className="meetings-cal-hour-cell" style={{ height: HOUR_HEIGHT }} />
            ))}
            {dayEvents.map((m) => {
              const startMin = meetingMinutesFromMidnightSp(m.starts_at);
              const gridStartMin = HOUR_START * 60;
              const top = ((startMin - gridStartMin) / 60) * HOUR_HEIGHT;
              const height = Math.max((m.duration_minutes / 60) * HOUR_HEIGHT - 2, 44);
              if (startMin < gridStartMin || startMin >= HOUR_END * 60 + 60) return null;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={clsx("meetings-cal-event", m.status === "cancelled" && "is-cancelled")}
                  style={{ top, height }}
                  onClick={() => onSelect(m.id)}
                  title={m.title}
                >
                  <span className="meetings-cal-event-time">
                    {new Intl.DateTimeFormat("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      hour: "2-digit",
                      minute: "2-digit"
                    }).format(new Date(m.starts_at))}
                  </span>
                  <span className="meetings-cal-event-title">{m.title}</span>
                  <span className="meetings-cal-event-meta">{m.client_name}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({ items, anchorYmd, onSelect }: { items: CalendarMeeting[]; anchorYmd: string; onSelect: (id: number) => void }) {
  const anchorMonth = anchorYmd.slice(0, 7);
  const days = monthGridDays(anchorYmd);
  const weekdays = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

  return (
    <div className="meetings-cal-month">
      {weekdays.map((w) => (
        <div key={w} className="meetings-cal-month-weekday">
          {w}
        </div>
      ))}
      {days.map((ymd) => {
        const inMonth = ymd.startsWith(anchorMonth);
        const isToday = ymd === formatYmdInSp();
        const dayEvents = eventsForDay(items, ymd);
        return (
          <div key={ymd} className={clsx("meetings-cal-month-cell", !inMonth && "is-outside", isToday && "is-today")}>
            <span className="meetings-cal-month-dom">{Number(ymd.slice(8, 10))}</span>
            <div className="meetings-cal-month-events">
              {dayEvents.slice(0, 4).map((m) => (
                <button key={m.id} type="button" className="meetings-cal-month-chip" onClick={() => onSelect(m.id)}>
                  {new Intl.DateTimeFormat("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    hour: "2-digit",
                    minute: "2-digit"
                  }).format(new Date(m.starts_at))}{" "}
                  {m.title}
                </button>
              ))}
              {dayEvents.length > 4 ? <span className="muted meetings-cal-month-more">+{dayEvents.length - 4}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MeetingsCalendar({ items, rangeKind, anchorYmd, onSelect }: Props) {
  if (rangeKind === "month") {
    return (
      <div className="meetings-cal-scroll">
        <MonthGrid items={items} anchorYmd={anchorYmd} onSelect={onSelect} />
      </div>
    );
  }

  const days = rangeKind === "day" ? [anchorYmd] : workWeekDaysFromAnchor(anchorYmd);

  return (
    <div className="meetings-cal-scroll">
      <TimeGrid days={days} items={items} onSelect={onSelect} />
    </div>
  );
}
