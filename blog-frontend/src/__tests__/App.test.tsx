import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import type { SessionSnapshot } from "@gosso/client";
import type { BlogUserProfile } from "../auth";

const {
  redirectToAuthorizeMock,
  getSnapshotMock,
  subscribeMock,
  setMockSnapshot,
} = vi.hoisted(() => {
  let currentSnapshot: SessionSnapshot<BlogUserProfile> = {
    accessToken: null,
    refreshToken: null,
    profile: null,
    loggedIn: false,
    isAdmin: false,
  };
  return {
    redirectToAuthorizeMock: vi.fn().mockResolvedValue(undefined),
    getSnapshotMock: vi.fn(() => currentSnapshot),
    subscribeMock: vi.fn(() => () => {}),
    setMockSnapshot: (snapshot: SessionSnapshot<BlogUserProfile>) => {
      currentSnapshot = snapshot;
    },
  };
});

vi.mock("../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth")>();
  return {
    ...actual,
    gossoClient: {
      ...actual.gossoClient,
      redirectToAuthorize: redirectToAuthorizeMock,
      getSnapshot: getSnapshotMock,
      subscribe: subscribeMock,
    },
    logout: vi.fn(),
  };
});

describe("admin route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockSnapshot({
      accessToken: null,
      refreshToken: null,
      profile: null,
      loggedIn: false,
      isAdmin: false,
    });
    window.history.replaceState({}, "", "/admin/dashboard");
  });

  it("shows a login transition rather than an empty admin page after logout", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("正在验证权限");
      expect(screen.getByRole("status")).toHaveTextContent(
        "正在前往安全登录页…",
      );
      expect(redirectToAuthorizeMock).toHaveBeenCalledWith("/admin/dashboard");
    });
  });

  it("keeps a signed-in non-admin user outside the admin shell", async () => {
    setMockSnapshot({
      accessToken: "token",
      refreshToken: "refresh",
      profile: { sub: "1", permissions: [] },
      loggedIn: true,
      isAdmin: false,
    });
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /无后台访问权限|No Admin Access/ }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("后台导航")).not.toBeInTheDocument();
    expect(redirectToAuthorizeMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "重新授权" }),
    ).not.toBeInTheDocument();
  });
});
