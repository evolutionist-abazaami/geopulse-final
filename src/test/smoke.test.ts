import { describe, expect, it } from "vitest";
import { cn } from "../lib/utils";

describe("frontend smoke test", () => {
  it("merges conflicting utility classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
