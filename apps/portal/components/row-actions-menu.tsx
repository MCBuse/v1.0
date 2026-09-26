"use client";

import { Button } from "@repo/ui/button";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type RowAction = {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};

/**
 * Secondary row actions behind one "…" button.
 * Menu-button pattern: Enter/Space/ArrowDown opens, arrows move, Escape and
 * outside clicks close, and focus returns to the trigger.
 */
export function RowActionsMenu({
  label,
  actions,
}: {
  label: string;
  actions: RowAction[];
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    items.current.find((item) => item && !item.disabled)?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    const enabled = items.current.filter(
      (item): item is HTMLButtonElement => Boolean(item && !item.disabled),
    );
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      enabled[(index + step + enabled.length) % enabled.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      enabled[event.key === "Home" ? 0 : enabled.length - 1]?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <Button
        ref={trigger}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal aria-hidden="true" />
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {actions.map((action, index) => (
            <button
              key={action.label}
              ref={(node) => {
                items.current[index] = node;
              }}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                close();
                action.onSelect();
              }}
              className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus-visible:bg-slate-50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4"
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
