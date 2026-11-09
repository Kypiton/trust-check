import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckAnalysisState } from "./CheckAnalysisState";

describe("unsupported-language result", () => {
  it("explains the English scope without rendering risk, score or generic screenshot guidance", () => {
    const html = renderToStaticMarkup(createElement(CheckAnalysisState, {
      analysis: { status: "INSUFFICIENT_DATA", reason: "UNSUPPORTED_LANGUAGE" },
    }));
    expect(html).toContain("English text required");
    expect(html).toContain("Text analysis currently supports English only.");
    expect(html).toContain("We could not assess this message.");
    expect(html).not.toMatch(/Low Risk|Risk score|High Risk|Upload a clearer screenshot/);
  });
});
