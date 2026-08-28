import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import HostedLoginRedirect from "../HostedLoginRedirect";

const { redirectToAuthorizeMock } = vi.hoisted(() => ({
  redirectToAuthorizeMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth")>();
  return {
    ...actual,
    gossoClient: {
      ...actual.gossoClient,
      redirectToAuthorize: redirectToAuthorizeMock,
    },
  };
});

describe("HostedLoginRedirect", () => {
  it("shows a transition while handing authentication to GOSSO", () => {
    render(
      <MemoryRouter initialEntries={["/login?return_to=%2Fadmin%2Fposts"]}>
        <HostedLoginRedirect />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在前往安全登录页");
    expect(redirectToAuthorizeMock).toHaveBeenCalledWith("/admin/posts");
  });
});
