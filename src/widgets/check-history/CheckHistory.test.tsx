import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CheckHistory } from "./CheckHistory";
import type { CheckHistoryItem } from "@/entities/check/server/get-user-check-history";
const item: CheckHistoryItem = { id: "check-id", inputType: "TEXT", status: "COMPLETED", riskLevel: "LOW", riskScore: 10, confidence: "LOW", createdAt: new Date("2026-11-11T00:30:00Z") };
const render = (items: CheckHistoryItem[]) => renderToStaticMarkup(<CheckHistory checks={items} />);
it("renders the empty state and actions to the public Check page", () => {
  const html = render([]); expect(html).toContain("No checks yet"); expect(html).toContain("Your saved analyses will appear here after you check a message, link, or screenshot."); expect(html).toContain("Start a check"); expect(html).toContain('href="/check"');
});
it.each([["TEXT", "Text"], ["URL", "Link"], ["SCREENSHOT", "Screenshot"]] as const)("maps %s to %s", (inputType, label) => {
  expect(render([{ ...item, inputType }])).toContain(`>${label}</dd>`);
});
it.each([["LOW", "Low Risk", "text-success"], ["MEDIUM", "Be Careful", "text-warning"], ["HIGH", "High Risk", "text-danger"]] as const)("shows %s risk with text and semantic color", (riskLevel, label, color) => {
  const html = render([{ ...item, riskLevel }]); expect(html).toContain(label); expect(html).toContain(color); expect(html).toContain("10/100");
});
it.each([["LOW", "Low confidence"], ["MEDIUM", "Medium confidence"], ["HIGH", "High confidence"]] as const)("labels %s confidence", (confidence, label) => {
  expect(render([{ ...item, confidence }])).toContain(label);
});
it("shows PARTIAL without failure language", () => {
  const html = render([{ ...item, status: "PARTIAL" }]); expect(html).toContain("Partial analysis"); expect(html).not.toMatch(/failed|failure/i);
});
it("handles incomplete assessment metadata without inventing a low score", () => {
  const html = render([{ ...item, status: "FAILED", riskLevel: null, riskScore: null, confidence: null }]);
  expect(html).toContain("Risk unavailable"); expect(html).toContain("Confidence unavailable"); expect(html).toContain("Analysis failed"); expect(html).not.toContain("0/100");
});
it("uses deterministic UTC dates and semantic time elements", () => {
  const html = render([item]); expect(html).toContain("Nov 11, 2026"); expect(html).toContain('dateTime="2026-11-11T00:30:00.000Z"'); expect(html).toContain("Dates in UTC");
});
it("provides a desktop grid and mobile definition lists without a wide table and with an accessible whole-row detail link", () => {
  const html = render([item]); expect(html).toContain("md:grid-cols-"); expect(html).toContain("grid-cols-2"); expect(html).toContain("<ul"); expect(html).toContain("<dl"); expect(html).toContain("<dt"); expect(html).not.toContain("<table"); expect(html).toContain('href="/check/check-id"'); expect(html).toContain("focus-visible:outline-primary"); expect(html).not.toContain("overflow-x-auto");
});
it("preserves query ordering", () => {
  const html = render([{ ...item, id: "new", inputType: "SCREENSHOT" }, { ...item, id: "old", inputType: "URL" }]);
  expect(html.indexOf(">Screenshot</dd>")).toBeLessThan(html.indexOf(">Link</dd>"));
});
