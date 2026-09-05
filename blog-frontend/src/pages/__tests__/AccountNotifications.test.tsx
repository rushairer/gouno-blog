import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import { notificationsApi } from "../../api/notifications";
import AccountNotifications from "../AccountNotifications";

function renderNotifications() {
  return render(
    <I18nProvider>
      <AccountNotifications />
    </I18nProvider>,
  );
}

describe("AccountNotifications", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the empty public account state", async () => {
    vi.spyOn(notificationsApi, "getNotifications").mockResolvedValue({
      list: [],
      total: 0,
    });

    renderNotifications();

    expect(
      await screen.findByText(/No notifications|暂无通知/i),
    ).toBeInTheDocument();
  });

  it("marks an unread notification as read without changing its route contract", async () => {
    vi.spyOn(notificationsApi, "getNotifications").mockResolvedValue({
      list: [
        {
          id: 9,
          type: "comment",
          title: "New reply",
          body: "Ada replied to your comment",
          created_at: "2026-09-06T00:00:00Z",
        },
      ],
      total: 1,
    });
    const markRead = vi
      .spyOn(notificationsApi, "markRead")
      .mockResolvedValue(undefined);
    const user = userEvent.setup();

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

  it("shows a retryable error when notifications cannot be loaded", async () => {
    vi.spyOn(notificationsApi, "getNotifications").mockRejectedValue(
      new Error("offline"),
    );

    renderNotifications();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Retry|重试/i }),
    ).toBeInTheDocument();
  });
});
