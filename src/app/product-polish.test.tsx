import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Home from "./page";
import NotFound from "./not-found";
import ErrorPage from "./error";

it("offers public checking and an anchored explanation from the landing page", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toMatch(/href="\/check"[^>]*>Check something/);
  expect(html).toContain('href="#how-it-works"');
  expect(html).toContain('id="how-it-works"');
  expect(html).toContain("No account needed to check.");
  expect(html).toContain("Example assessment");
  expect(html).toContain("Illustration only");
  for (const label of ["Text", "Link", "Screenshot"]) expect(html).toContain(`>${label}</h3>`);
  expect(html).not.toMatch(/coming soon|placeholder/i);
});

it("accurately distinguishes unsaved anonymous checks, metadata, and external processing", () => {
  const html = renderToStaticMarkup(<Home />);
  for (const copy of ["Anonymous analyses are not saved", "automatically saved to History as result metadata", "not stored in saved History", "external security providers", "not a guarantee of safety"]) expect(html).toContain(copy);
  expect(html).not.toMatch(/fully local|guaranteed safe|verified safe/i);
});

it("offers safe 404 navigation without revealing ownership", () => {
  const html = renderToStaticMarkup(<NotFound />);
  expect(html).toContain("Page not found");
  expect(html).toContain('href="/check"');
  expect(html).toContain('href="/"');
  expect(html).not.toMatch(/another user|owner|Prisma|stack/i);
});

it("offers generic recovery without rendering exception details", () => {
  const html = renderToStaticMarkup(<ErrorPage error={new Error("private detail")} retry={() => {}} />);
  expect(html).toContain("Try again");
  expect(html).toContain("Start new check");
  expect(html).toContain("Go home");
  expect(html).not.toMatch(/Prisma|DATABASE_URL|stack/i);
});
