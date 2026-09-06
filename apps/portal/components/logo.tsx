export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span
        aria-hidden="true"
        className={`grid size-9 place-items-center rounded-full ${inverse ? "bg-white text-blue-700" : "bg-blue-600 text-white"}`}
      >
        <span className="text-base font-bold">M</span>
      </span>
      <span className={inverse ? "text-white" : "text-slate-950"}>MCBuse</span>
    </div>
  );
}
