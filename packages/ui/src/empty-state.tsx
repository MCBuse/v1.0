import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-48 place-items-center px-6 py-10 text-center">
      <div className="max-w-sm">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

export function ErrorState({ retry }: { retry?: ReactNode }) {
  return (
    <EmptyState
      title="We could not load this"
      description="Check your connection and try again. Your payment records are safe."
      action={retry}
    />
  );
}
