import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("smoke", () => {
  it("parses with zod", () => {
    expect(z.object({ n: z.number() }).parse({ n: 1 })).toEqual({ n: 1 });
  });
});
