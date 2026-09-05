import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../ErrorBoundary";
import { I18nProvider } from "../../i18n";

function BrokenView(): never {
  throw new Error("render failed");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("renders the shared recoverable error state", () => {
    render(
      <I18nProvider>
        <ErrorBoundary>
          <BrokenView />
        </ErrorBoundary>
      </I18nProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /页面遇到了错误|Something went wrong/i,
    );
    expect(
      screen.getByRole("button", { name: /刷新页面|Reload/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /返回首页|Home/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("render failed", { exact: false }),
    ).toBeInTheDocument();
  });

  it("keeps an explicitly supplied fallback intact", () => {
    render(
      <I18nProvider>
        <ErrorBoundary fallback={<p>Custom fallback</p>}>
          <BrokenView />
        </ErrorBoundary>
      </I18nProvider>,
    );

    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
  });
});
