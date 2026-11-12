import { describe, expect, it } from "vitest";
import { LINK_EXAMPLE, suggestedLinkFromText, textExample } from "./check-examples";

describe("check examples and smart link suggestion", () => {
  it("provides localized text examples and a reserved-domain link example", () => {
    expect(textExample("en")).toContain("URGENT");
    expect(textExample("ru")).toContain("СРОЧНО");
    expect(LINK_EXAMPLE).toBe("http://paypa1.example/login");
  });

  it.each([
    ["https://example.com/path", "https://example.com/path"],
    ["www.example.com", "www.example.com"],
    ["example.com/login", "example.com/login"],
    ["  https://example.com  ", "https://example.com"],
  ])("recognizes an input that is entirely a link: %s", (input, expected) => {
    expect(suggestedLinkFromText(input)).toBe(expected);
  });

  it.each([
    "Please visit https://example.com",
    "hello world",
    "person@example.com",
    "javascript:alert(1)",
    "localhost:3000",
    "version1.2",
    "",
  ])("does not turn ordinary or unsupported text into a link suggestion: %s", (input) => {
    expect(suggestedLinkFromText(input)).toBeNull();
  });
});
