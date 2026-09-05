import { DATA_FIELDS } from "./content";

const HEAD = "px-6 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-subtle";

export function DataFieldTable() {
  return (
    <div className="overflow-x-auto border border-border bg-surface">
      <table className="w-full min-w-[30rem] border-collapse text-left">
        <caption className="sr-only">
          Partner-visible merchant profile fields, classification levels 1 and 2
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={HEAD}>
              Field
            </th>
            <th scope="col" className={HEAD}>
              Type
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Level
            </th>
          </tr>
        </thead>
        <tbody>
          {DATA_FIELDS.map((f) => (
            <tr key={f.field} className="border-b border-border last:border-b-0">
              <td className="px-6 py-3.5 font-mono text-sm text-text">{f.field}</td>
              <td className="px-6 py-3.5 font-mono text-sm text-subtle">{f.type}</td>
              <td className="px-6 py-3.5 text-right">
                <span className="inline-flex border border-border-strong px-2 py-0.5 font-mono text-[11px] text-muted">
                  {f.level}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
