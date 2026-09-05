"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { linkFocusClass } from "./primitives";

type Item = { readonly q: string; readonly a: string };

export function Accordion({ items }: { items: readonly Item[] }) {
  // First row starts open so the pattern is obvious.
  const [open, setOpen] = useState(0);
  const baseId = useId();

  return (
    <div className="border-t border-border">
      {items.map((item, i) => {
        const isOpen = open === i;
        const panelId = `${baseId}-panel-${i}`;
        const buttonId = `${baseId}-button-${i}`;

        return (
          <div key={item.q} className="border-b border-border">
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className={`flex w-full items-center justify-between gap-6 py-5 text-left ${linkFocusClass}`}
              >
                <span className="text-base font-medium text-text">{item.q}</span>
                <span
                  aria-hidden
                  className={`shrink-0 transition-colors duration-200 ${isOpen ? "text-accent" : "text-subtle"}`}
                >
                  {isOpen ? <Minus size={18} /> : <Plus size={18} />}
                </span>
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen}>
              <p className="max-w-3xl pb-6 text-base leading-relaxed text-muted">{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
