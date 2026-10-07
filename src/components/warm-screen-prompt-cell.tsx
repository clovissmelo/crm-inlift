"use client";

import { useEffect, useState } from "react";

type PromptLine = { text: string; variant?: "dim" | "warn" | "err" | "ok" };

export function WarmScreenPromptCell({
  prompt
}: {
  prompt: { lines: PromptLine[]; live: boolean };
}) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!prompt.live) {
      setDots("");
      return;
    }
    const t = window.setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : `${d}.`));
    }, 420);
    return () => window.clearInterval(t);
  }, [prompt.live]);

  const lastIdx = prompt.lines.length - 1;

  return (
    <div className={`warm-screen-prompt${prompt.live ? " is-live" : ""}`} aria-label="Prompt do motor">
      {prompt.lines.map((line, i) => {
        const isLast = i === lastIdx;
        const showDots = prompt.live && isLast && !line.text.startsWith("[X]");
        return (
          <div
            key={`${line.text}-${i}`}
            className={`warm-screen-prompt-line${line.variant ? ` warm-screen-prompt-${line.variant}` : ""}${
              isLast && prompt.live ? " warm-screen-prompt-active-line" : ""
            }`}
          >
            <span>{line.text}</span>
            {showDots ? <span className="warm-screen-prompt-dots">{dots}</span> : null}
            {isLast && prompt.live ? <span className="warm-screen-prompt-caret">▮</span> : null}
          </div>
        );
      })}
    </div>
  );
}
