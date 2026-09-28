import {
  CREDIT_GRADE_BANDS,
  CREDIT_SCORE_RANGE,
  creditGradeTone,
  type CreditScore,
  type ScoreTone,
} from "@repo/shared";

const BAND_WIDTH = 100 / CREDIT_GRADE_BANDS.length;

/** The filled band follows the grade: green for Good/Excellent, blue for Acceptable, amber for Sufficient. */
const FILL: Record<ScoreTone, string> = {
  positive: "bg-emerald-500",
  neutral: "bg-blue-500",
  caution: "bg-amber-500",
};
/**
 * Bands are drawn equally wide so every grade name fits; the marker sits
 * proportionally inside its band.
 */
function position(value: number) {
  const index = Math.max(
    0,
    CREDIT_GRADE_BANDS.findIndex((b) => value >= b.from && value <= b.to),
  );
  const band = CREDIT_GRADE_BANDS[index]!;
  const within = Math.min(
    1,
    Math.max(0, (value - band.from) / (band.to - band.from)),
  );
  return (index + within) * BAND_WIDTH;
}

/**
 * The 300–850 scale split into its grade bands, with a marker at the score.
 * The merchant's own band is filled in its grade colour; the rest stay neutral.
 */
export function CreditScoreScale({ credit }: { credit: CreditScore }) {
  const at = position(credit.score);
  const fill = FILL[creditGradeTone(credit.grade)];
  return (
    <div className="grid w-full max-w-md gap-1.5">
      <div
        className="relative pt-3"
        role="img"
        aria-label={`Credit score ${credit.score} on a scale of ${CREDIT_SCORE_RANGE.min} to ${CREDIT_SCORE_RANGE.max}, grade ${credit.grade}`}
      >
        <span
          aria-hidden="true"
          className="absolute top-0 size-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-slate-900"
          style={{ left: `${at}%` }}
        />
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {CREDIT_GRADE_BANDS.map((band) => (
            <span
              key={band.grade}
              className={
                band.grade === credit.grade ? fill : "bg-white"
              }
              style={{ width: `${BAND_WIDTH}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex text-[11px] text-slate-500 sm:text-xs">
        {CREDIT_GRADE_BANDS.map((band) => (
          <span
            key={band.grade}
            className={`min-w-0 truncate pr-1 ${
              band.grade === credit.grade ? "font-semibold text-slate-900" : ""
            }`}
            style={{ width: `${BAND_WIDTH}%` }}
          >
            {band.grade}
          </span>
        ))}
      </div>
      <div className="flex font-mono text-[11px] tabular-nums text-slate-400">
        {CREDIT_GRADE_BANDS.map((band) => (
          <span key={band.grade} style={{ width: `${BAND_WIDTH}%` }}>
            {band.from}
          </span>
        ))}
      </div>
    </div>
  );
}
