import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckAnalysisState } from "./CheckAnalysisState";

describe("unsupported-language result", () => {
  it("explains the English scope without rendering risk, score or generic screenshot guidance", () => {
    const html = renderToStaticMarkup(createElement(CheckAnalysisState, {
      analysis: { status: "INSUFFICIENT_DATA", reason: "UNSUPPORTED_LANGUAGE" },
    }));
    expect(html).toContain("English or Russian text required");
    expect(html).toContain("Text analysis supports English and Russian.");
    expect(html).toContain("We could not assess this message.");
    expect(html).not.toMatch(/Low Risk|Risk score|High Risk|Upload a clearer screenshot/);
  });
});

import { LocaleProvider } from "@/shared/i18n/LocaleProvider";
import { AnalysisActivity } from "./AnalysisActivity";

it.each(["en", "ru"] as const)("describes possible checks without fabricated progress in %s", locale => {
  for (const mode of ["TEXT", "URL", "SCREENSHOT"] as const) {
    const html = renderToStaticMarkup(createElement(LocaleProvider, { locale }, createElement(AnalysisActivity, { mode })));
    expect(html).toContain(locale === "ru" ? "не текущих этапов" : "not live progress steps");
    expect(html).not.toMatch(/\d+%|aria-current="step"|>Completed<|>Готово<|>Завершено</);
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(/Low Risk|Низкий риск|Risk score|Оценка риска/);
  }
});
