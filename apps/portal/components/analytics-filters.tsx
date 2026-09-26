"use client";

import { useMemo, useState } from "react";
import { Input } from "@repo/ui/field";
import {
  FacetFilter,
  ResetFilters,
  SOURCE_OPTIONS,
} from "@/components/analytics-toolbar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Preset = "7d" | "30d" | "90d" | "custom";
export function useAnalyticsFilters() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("all");
  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (preset === "custom" && from && to) {
      params.set("from", new Date(`${from}T00:00:00`).toISOString());
      params.set("to", new Date(`${to}T23:59:59`).toISOString());
    } else params.set("period", preset === "custom" ? "30d" : preset);
    if (source !== "all") params.set("source", source);
    return `me/analytics?${params.toString()}`;
  }, [preset, from, to, source]);
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
  };
}

export function AnalyticsFilters({
  filters,
}: {
  filters: ReturnType<typeof useAnalyticsFilters>;
}) {
  const { preset, setPreset, from, setFrom, to, setTo, source, setSource } =
    filters;
  return (
    <div
      role="group"
      aria-label="Analytics filters"
      className="flex flex-wrap items-center gap-2"
    >
      <ToggleGroup
        type="single"
        aria-label="Period"
        value={preset}
        onValueChange={(value) => {
          if (value) setPreset(value as Preset);
        }}
      >
        {(["7d", "30d", "90d"] as const).map((value) => (
          <ToggleGroupItem key={value} value={value}>
            {value.replace("d", " days")}
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
      </ToggleGroup>
      {preset === "custom" ? (
        <>
          <Input
            aria-label="Analytics start date"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 min-h-9 w-auto"
          />
          <Input
            aria-label="Analytics end date"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 min-h-9 w-auto"
          />
        </>
      ) : null}
      <FacetFilter
        title="Source"
        options={SOURCE_OPTIONS}
        value={source === "all" ? null : source}
        onChange={(value) => setSource(value ?? "all")}
      />
      {preset !== "30d" || source !== "all" ? (
        <ResetFilters
          onReset={() => {
            setPreset("30d");
            setFrom("");
            setTo("");
            setSource("all");
          }}
        />
      ) : null}
    </div>
  );
}
