"use client";

import { useMemo, useState } from "react";
import type { MerchantAnalytics } from "@repo/shared";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Money } from "@repo/ui/money";
import { Button } from "@repo/ui/button";
import Link from "next/link";
import { ErrorState } from "@repo/ui/empty-state";
import { Skeleton } from "@repo/ui/skeleton";
import { Input } from "@repo/ui/field";
import { usePortalResource } from "@/lib/client/use-portal-resource";

type Preset = "7d" | "30d" | "90d" | "custom";
export function AnalyticsDashboard() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [source, setSource] = useState("all"); const [environment, setEnvironment] = useState("all");
  const path = useMemo(() => { const params = new URLSearchParams(); if (preset === "custom" && from && to) { params.set("from", new Date(`${from}T00:00:00`).toISOString()); params.set("to", new Date(`${to}T23:59:59`).toISOString()); } else params.set("period", preset === "custom" ? "30d" : preset); if (source !== "all") params.set("source", source); if (environment !== "all") params.set("environment", environment); return `me/analytics?${params.toString()}`; }, [preset, from, to, source, environment]);
  const resource = usePortalResource<MerchantAnalytics>(path);
  if (resource.loading && !resource.data) return <Skeleton className="h-96"/>;
  if (!resource.data) return <ErrorState retry={<Button onClick={() => void resource.refresh()}>Try again</Button>}/>;
  const data = resource.data;
  const patterns = useMemo(() => {
    const weekdays = Array.from({ length: 7 }, (_, day) => ({
      label: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + day))),
      sales: 0,
      amount: 0n,
    }));
    for (const item of data.dailyTrend) {
      const weekday = new Date(`${item.start}T00:00:00.000Z`).getUTCDay();
      const day = weekdays[weekday];
      if (day) {
        day.sales += item.paymentCount;
        day.amount += BigInt(item.amountMinor);
      }
    }
    const peakHour = [...data.hourlyRhythm].sort((a, b) => b.paymentCount - a.paymentCount)[0];
    return { weekdays, peakHour: peakHour?.paymentCount ? peakHour : null };
  }, [data.dailyTrend, data.hourlyRhythm]);
  const trend = useMemo(() => {
    const days = data.dailyTrend.length;
    const grouping = days > 180 ? "month" : days > 31 ? "week" : "day";
    const buckets = new Map<string, { amountMinor: bigint; paymentCount: number }>();
    for (const item of data.dailyTrend) {
      const date = new Date(`${item.start}T00:00:00.000Z`);
      let key = item.start;
      if (grouping === "month") key = item.start.slice(0, 7);
      if (grouping === "week") {
        const mondayOffset = (date.getUTCDay() + 6) % 7;
        date.setUTCDate(date.getUTCDate() - mondayOffset);
        key = date.toISOString().slice(0, 10);
      }
      const bucket = buckets.get(key) ?? { amountMinor: 0n, paymentCount: 0 };
      bucket.amountMinor += BigInt(item.amountMinor);
      bucket.paymentCount += item.paymentCount;
      buckets.set(key, bucket);
    }
    return { grouping, items: [...buckets.entries()].map(([start, item]) => ({ start, amountMinor: item.amountMinor.toString(), paymentCount: item.paymentCount })) };
  }, [data.dailyTrend]);
  const bestSelling = data.productPerformance.filter((item) => item.quantitySold > 0).slice(0, 5);
  const slowMoving = [...data.productPerformance].sort((left, right) => {
    if (left.quantitySold !== right.quantitySold) return left.quantitySold - right.quantitySold;
    return BigInt(left.totalSales.minor) < BigInt(right.totalSales.minor) ? -1 : BigInt(left.totalSales.minor) > BigInt(right.totalSales.minor) ? 1 : 0;
  }).slice(0, 5);
  return <div className="grid gap-6"><div><p className="text-sm font-medium text-blue-700">Analytics</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Why your sales are changing</h1><p className="mt-2 text-sm text-slate-500">Recorded activity only. Payment-method shares do not establish complete business turnover.</p></div>
    <div className="flex flex-wrap items-center gap-2">{(["7d", "30d", "90d"] as const).map((value) => <Button key={value} size="sm" variant={preset === value ? "primary" : "secondary"} onClick={() => setPreset(value)}>{value.replace("d", " days")}</Button>)}<Button size="sm" variant={preset === "custom" ? "primary" : "secondary"} onClick={() => setPreset("custom")}>Custom</Button>{preset === "custom" ? <><Input aria-label="Analytics start date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-auto"/><Input aria-label="Analytics end date" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-auto"/></> : null}<label htmlFor="analytics-source" className="ml-2 text-sm text-slate-600">Source</label><select id="analytics-source" value={source} onChange={(event) => setSource(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="all">All activity</option><option value="mcbuse_payment">MCBuse payments</option><option value="merchant_cash">Merchant cash</option></select><label htmlFor="analytics-environment" className="ml-2 text-sm text-slate-600">Environment</label><select id="analytics-environment" value={environment} onChange={(event) => setEnvironment(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="all">All environments</option><option value="live">Live</option><option value="test">Test</option><option value="synthetic">Synthetic</option><option value="unknown">Unknown</option></select></div>
    <p className="text-xs text-slate-500">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: data.period.timezone }).format(new Date(data.period.from))} – {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: data.period.timezone }).format(new Date(data.period.to))} · {data.period.timezone}{data.period.partialCurrentDay ? " · current day is partial" : ""}</p>
    <div className="grid gap-4 sm:grid-cols-4"><Metric label="Recorded sales" value={<Money value={data.totalRecordedSales}/>}/><Metric label="Sales" value={data.saleCount}/><Metric label="Average sale" value={<Money value={data.averageSale}/>}/><Metric label="Previous period" value={data.comparisonPercent === null ? "Unavailable" : `${data.comparisonPercent > 0 ? "+" : ""}${data.comparisonPercent.toFixed(1)}%`}/></div>
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><h2 className="font-semibold">Payment method split</h2></CardHeader><CardContent className="grid gap-3 text-sm"><div className="flex justify-between"><span>Verified MCBuse payments</span><Money value={data.digitalSales}/></div><div className="flex justify-between"><span>Merchant-recorded cash</span><Money value={data.cashSales}/></div></CardContent></Card><Card><CardHeader><h2 className="font-semibold">Evidence coverage</h2></CardHeader><CardContent className="grid gap-2 text-sm text-slate-600"><p>{data.sourceCoverage.mcbuse_payment} verified payment record(s)</p><p>{data.sourceCoverage.merchant_cash} merchant-recorded cash sale(s)</p><p className="text-xs">Generated {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.generatedAt))}</p></CardContent></Card></div>
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><h2 className="font-semibold">{trend.grouping === "day" ? "Daily" : trend.grouping === "week" ? "Weekly" : "Monthly"} recorded sales</h2></CardHeader><CardContent>{trend.items.length ? <div className="grid gap-2">{trend.items.slice(-14).map((item) => <div key={item.start} className="flex items-center justify-between text-sm"><span>{trend.grouping === "week" ? `Week of ${item.start}` : item.start}</span><span>{item.paymentCount} sale(s) · €{(Number(item.amountMinor) / 100).toFixed(2)}</span></div>)}</div> : <p className="text-sm text-slate-500">No recorded sales in this period.</p>}</CardContent></Card><Card><CardHeader><h2 className="font-semibold">Selling patterns</h2></CardHeader><CardContent className="grid gap-3 text-sm"><p>{patterns.peakHour ? <>Peak selling hour: <span className="font-medium text-slate-950">{patterns.peakHour.start}</span> ({patterns.peakHour.paymentCount} sale{patterns.peakHour.paymentCount === 1 ? "" : "s"})</> : "No selling-hour pattern yet."}</p><div className="grid grid-cols-7 gap-1">{patterns.weekdays.map((day) => <div key={day.label} className="rounded bg-slate-50 p-2 text-center"><p className="text-xs text-slate-500">{day.label}</p><p className="mt-1 font-medium text-slate-950">{day.sales}</p></div>)}</div><p className="text-xs text-slate-500">Days show the number of recorded sales in this period, including days with no sales.</p></CardContent></Card></div>
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><h2 className="font-semibold">Best-selling products</h2></CardHeader><CardContent className="grid gap-2 text-sm">{bestSelling.length ? bestSelling.map((item) => <div key={item.productId} className="flex items-center justify-between gap-3"><span className="truncate">{item.name}</span><span className="whitespace-nowrap text-slate-600">{item.quantitySold} units · <Money value={item.totalSales}/></span></div>) : <p className="text-slate-500">No product-linked sales in this period.</p>}</CardContent></Card><Card><CardHeader><h2 className="font-semibold">Slow-moving products</h2></CardHeader><CardContent className="grid gap-2 text-sm">{slowMoving.length ? slowMoving.map((item) => <div key={item.productId} className="flex items-center justify-between gap-3"><span className="truncate">{item.name}</span><span className="whitespace-nowrap text-slate-600">{item.quantitySold} units</span></div>) : <p className="text-slate-500">No products in the catalogue.</p>}<p className="pt-1 text-xs text-slate-500">This uses sale-time product lines; custom cash items remain unassigned.</p></CardContent></Card></div>
    <Card><CardHeader><h2 className="font-semibold">Actions</h2></CardHeader><CardContent className="flex flex-wrap gap-3"><Button asChild variant="secondary"><Link href="/analytics/transactions">Transactions</Link></Button><Button asChild variant="secondary"><Link href="/analytics/inventory">Inventory</Link></Button></CardContent></Card>
  </div>;
}
function Metric({label,value}:{label:string;value:React.ReactNode}) { return <Card><CardContent className="pt-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p></CardContent></Card>; }
