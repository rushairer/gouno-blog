import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./theme";

function Probe() {
  const { brand, resolvedMode } = useTheme();
  return <output>{brand}:{resolvedMode}</output>;
}

describe("ThemeProvider", () => {
  it("applies the brand and exposes the resolved mode", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    });
    render(<ThemeProvider brand="blog-admin" storageKey="test-theme"><Probe /></ThemeProvider>);
    expect(screen.getByText("blog-admin:light")).toBeTruthy();
    expect(document.documentElement.dataset.brand).toBe("blog-admin");
  });

  it("does not require matchMedia in constrained runtimes", () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
    expect(() => render(<ThemeProvider brand="blog" storageKey="test-theme-no-media"><Probe /></ThemeProvider>)).not.toThrow();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
  });
});
