import type { MerchantSummaryBucket } from "@repo/shared";

function values(buckets: MerchantSummaryBucket[]) {
  return buckets.map((bucket) => Number(BigInt(bucket.amountMinor)) / 100);
}

export function SalesBars({
  buckets,
  label,
}: {
  buckets: MerchantSummaryBucket[];
  label: string;
}) {
  const amounts = values(buckets);
  const max = Math.max(...amounts, 1);
  return (
    <div>
      <div
        className="flex h-44 items-end gap-1.5"
        role="img"
        aria-label={label}
      >
        {buckets.map((bucket, index) => {
          const amount = amounts[index] ?? 0;
          return (
            <div
              key={bucket.start}
              className="group relative flex min-w-0 flex-1 items-end"
            >
              <div
                className="w-full rounded-t-sm bg-blue-100 transition-colors group-hover:bg-blue-500"
                style={{ height: `${Math.max(3, (amount / max) * 100)}%` }}
                title={`${bucket.start}: €${amount.toFixed(2)}`}
              />
            </div>
          );
        })}
      </div>
      <table className="sr-table">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Amount</th>
            <th>Payments</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket, index) => (
            <tr key={bucket.start}>
              <td>{bucket.start}</td>
              <td>€{(amounts[index] ?? 0).toFixed(2)}</td>
              <td>{bucket.paymentCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HourlyRhythm({
  buckets,
}: {
  buckets: MerchantSummaryBucket[];
}) {
  const amounts = values(buckets);
  const max = Math.max(...amounts, 1);
  return (
    <div>
      <div
        className="flex h-24 items-end gap-1"
        role="img"
        aria-label="Hourly sales rhythm for the last 30 days"
      >
        {buckets.map((bucket, index) => {
          const amount = amounts[index] ?? 0;
          return (
            <div
              key={bucket.start}
              className="min-w-0 flex-1 rounded-t-sm bg-slate-200"
              style={{ height: `${Math.max(4, (amount / max) * 100)}%` }}
              title={`${bucket.start}: €${amount.toFixed(2)}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>
      <table className="sr-table">
        <caption>Hourly sales rhythm</caption>
        <thead>
          <tr>
            <th>Hour</th>
            <th>Amount</th>
            <th>Payments</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket, index) => (
            <tr key={bucket.start}>
              <td>{bucket.start}</td>
              <td>€{(amounts[index] ?? 0).toFixed(2)}</td>
              <td>{bucket.paymentCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
