import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { getManagementAccess, redirectToAuthorize } from "../auth";

vi.mock("../auth", () => ({
  getManagementAccess: vi.fn(),
  redirectToAuthorize: vi.fn(),
  logout: vi.fn(),
}));

describe("admin route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getManagementAccess).mockResolvedValue("anonymous");
    vi.mocked(redirectToAuthorize).mockResolvedValue(undefined);
    window.history.replaceState({}, "", "/admin/dashboard");
  });

  it("shows a login transition rather than an empty admin page after logout", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("需要登录");
      expect(screen.getByRole("status")).toHaveTextContent(
        "正在前往安全登录页…",
      );
      expect(redirectToAuthorize).toHaveBeenCalledWith("/admin/dashboard");
    });
  });

  it("keeps a signed-in non-admin user outside the admin shell", async () => {
    vi.mocked(getManagementAccess).mockResolvedValue("denied");
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "无后台访问权限" }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("后台导航")).not.toBeInTheDocument();
    expect(redirectToAuthorize).not.toHaveBeenCalled();
  });
});
