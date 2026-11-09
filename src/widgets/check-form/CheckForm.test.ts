import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeTextAction } from "../../features/analyze-text/actions/analyze-text-action";
import { analyzeUrlAction } from "../../features/analyze-url/actions/analyze-url-action";
import { CheckForm } from "./CheckForm";

vi.mock("../../features/analyze-text/actions/analyze-text-action", () => ({ analyzeTextAction: vi.fn() }));
vi.mock("../../features/analyze-url/actions/analyze-url-action", () => ({ analyzeUrlAction: vi.fn() }));
const state = vi.hoisted(() => ({ mode: "SCREENSHOT" }));
// Exercise the component's actual submission handler without a DOM dependency.
// Only hook state/effects are replaced; no business or submission logic is mocked.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => [initial === "TEXT" ? state.mode : initial, vi.fn()],
    useRef: (initial: unknown) => ({ current: initial }),
    useId: () => "check-form-test",
    useEffect: () => {},
  };
});
afterEach(() => { vi.clearAllMocks(); state.mode = "SCREENSHOT"; });

type ElementProps = {
  children?: ReactNode;
  type?: string;
  disabled?: boolean;
  onSubmit?: (event: { preventDefault: () => void }) => void;
};
function findElement(node: ReactNode, predicate: (element: ReactElement<ElementProps>) => boolean): ReactElement<ElementProps> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<ElementProps>(child)) continue;
    if (predicate(child)) return child;
    const found = findElement(child.props.children, predicate);
    if (found) return found;
  }
}

describe("CheckForm availability", () => {
  it("keeps the Screenshot tab but clearly disables analysis and removes file selection", () => {
    const tree = CheckForm({});
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Screenshot analysis is coming soon");
    expect(html).toContain("Screenshot</button>");
    expect(html).not.toContain('type="file"');
    const button = findElement(tree, (element) => element.type === "button" && element.props.type === "submit");
    expect(button?.props.disabled).toBe(true);
  });

  it("cannot call either Server Action even if screenshot submission is invoked directly", () => {
    const tree = CheckForm({});
    const form = findElement(tree, (element) => element.type === "form");
    const preventDefault = vi.fn();
    expect(form?.props.onSubmit).toBeTypeOf("function");
    form!.props.onSubmit!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(analyzeTextAction).not.toHaveBeenCalled();
    expect(analyzeUrlAction).not.toHaveBeenCalled();
  });

  it("discloses the English-only scope beside the text input", () => {
    state.mode = "TEXT";
    const html = renderToStaticMarkup(CheckForm({}));
    expect(html).toContain("Text analysis currently supports English only.");
    expect(html).toContain('aria-describedby="check-form-test-language check-form-test-count"');
  });
});
