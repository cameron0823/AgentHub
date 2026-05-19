import { describe, expect, it } from "vitest";

describe("Vitest harness", () => {
  it("runs browser-adjacent unit tests with happy-dom", () => {
    const root = document.createElement("div");
    root.dataset.testid = "vitest-happy-dom";
    document.body.append(root);

    expect(document.querySelector("[data-testid='vitest-happy-dom']")).toBe(root);
  });
});
