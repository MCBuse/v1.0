"use client";

import { useMemo, useState } from "react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/field";

type Preset = "7d" | "30d" | "90d" | "custom";
export function useAnalyticsFilters() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("all");
  const [environment, setEnvironment] = useState("all");
  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (preset === "custom" && from && to) {
      params.set("from", new Date(`${from}T00:00:00`).toISOString());
      params.set("to", new Date(`${to}T23:59:59`).toISOString());
    } else params.set("period", preset === "custom" ? "30d" : preset);
    if (source !== "all") params.set("source", source);
    if (environment !== "all") params.set("environment", environment);
    return `me/analytics?${params.toString()}`;
  }, [preset, from, to, source, environment]);
  return {
    path,
    preset,
    setPreset,
    from,
    setFrom,
    to,
    setTo,
    source,
    setSource,
    environment,
    setEnvironment,
  };
}

export function AnalyticsFilters({
  filters,
}: {
  filters: ReturnType<typeof useAnalyticsFilters>;
}) {
  const {
    preset,
    setPreset,
    from,
    setFrom,
    to,
    setTo,
    source,
    setSource,
    environment,
    setEnvironment,
  } = filters;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["7d", "30d", "90d"] as const).map((value) => (
        <Button
          key={value}
          size="sm"
          variant={preset === value ? "primary" : "secondary"}
          onClick={() => setPreset(value)}
        >
          {value.replace("d", " days")}
        </Button>
      ))}
      <Button
        size="sm"
        variant={preset === "custom" ? "primary" : "secondary"}
        onClick={() => setPreset("custom")}
      >
        Custom
      </Button>
      {preset === "custom" ? (
        <>
          <Input
            aria-label="Analytics start date"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-auto"
          />
          <Input
            aria-label="Analytics end date"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-auto"
          />
        </>
      ) : null}
      <label htmlFor="analytics-source" className="ml-2 text-sm text-slate-600">
        Source
      </label>
      <select
        id="analytics-source"
        value={source}
        onChange={(event) => setSource(event.target.value)}
        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
      >
        <option value="all">All activity</option>
        <option value="mcbuse_payment">MCBuse payments</option>
        <option value="merchant_cash">Merchant cash</option>
      </select>
      <label
        htmlFor="analytics-environment"
        className="ml-2 text-sm text-slate-600"
      >
        Environment
      </label>
      <select
        id="analytics-environment"
        value={environment}
        onChange={(event) => setEnvironment(event.target.value)}
        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
      >
        <option value="all">All environments</option>
        <option value="live">Live</option>
        <option value="test">Test</option>
        <option value="synthetic">Synthetic</option>
        <option value="unknown">Unknown</option>
      </select>
    </div>
  );
}
