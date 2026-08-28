import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import HostedLoginRedirect from "../HostedLoginRedirect";

vi.mock("../../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth")>();
  return {
    ...actual,
    gossoAdminURL: "/identity-admin",
    redirectToHostedLogin: vi.fn(),
  };
});

describe("HostedLoginRedirect", () => {
  it("shows a transition while handing authentication to GOSSO", () => {
    render(
      <MemoryRouter
        initialEntries={["/login?redirect_uri=%2Foauth2%2Fauthorize"]}
      >
        <HostedLoginRedirect />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在前往安全登录页");
  });
});
