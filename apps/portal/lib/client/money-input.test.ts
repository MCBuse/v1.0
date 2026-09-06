import { describe, expect, it } from "vitest";
import { euroInputToMinor } from "./money-input";

describe("euroInputToMinor", () => {
  it("converts whole and decimal euro inputs to integer cents", () => {
    expect(euroInputToMinor("12")).toBe("1200");
    expect(euroInputToMinor("12.9")).toBe("1290");
    expect(euroInputToMinor("12,99")).toBe("1299");
  });

  it("rejects zero, negative, and sub-cent inputs", () => {
    expect(euroInputToMinor("0")).toBeNull();
    expect(euroInputToMinor("-1")).toBeNull();
    expect(euroInputToMinor("1.001")).toBeNull();
  });
});
