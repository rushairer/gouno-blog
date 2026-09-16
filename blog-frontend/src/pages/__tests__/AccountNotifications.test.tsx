import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AccountNotifications from "../AccountNotifications";
import { notificationsApi } from "../../api/notifications";
import { I18nProvider } from "../../i18n";

function renderNotifications() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/account/notifications"]}>
        <AccountNotifications />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("AccountNotifications", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the empty public account state", async () => {
    vi.spyOn(notificationsApi, "getNotifications").mockResolvedValue({
      notifications: [],
      unread_count: 0,
    });

    renderNotifications();

    expect(
      await screen.findByText(/No notifications yet|暂无通知/i),
    ).toBeInTheDocument();
  });

  it("marks an unread notification as read without changing its route contract", async () => {
    const user = userEvent.setup();
    const markRead = vi
      .spyOn(notificationsApi, "markNotificationRead")
      .mockResolvedValue(undefined);
    vi.spyOn(notificationsApi, "getNotifications").mockResolvedValue({
      notifications: [
        {
          id: 9,
          type: "comment_reply",
          title: "New reply",
          message: "Someone replied to your comment.",
          href: "/articles/canonical-oauth2#comments",
          read_at: null,
          created_at: "2026-09-15T10:00:00Z",
        },
      ],
      unread_count: 1,
    });

    renderNotifications();

    await screen.findByText("New reply");
    await user.click(
      screen.getByRole("button", { name: /Mark as read|标记为已读/i }),
    );

    await waitFor(() => expect(markRead).toHaveBeenCalledWith(9));
    expect(
      screen.queryByRole("button", { name: /Mark as read|标记为已读/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a reload action when notifications cannot be loaded", async () => {
    vi.spyOn(notificationsApi, "getNotifications").mockRejectedValue(
      new Error("offline"),
    );

    renderNotifications();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reload|重新载入/i }),
    ).toBeInTheDocument();
  });
});
