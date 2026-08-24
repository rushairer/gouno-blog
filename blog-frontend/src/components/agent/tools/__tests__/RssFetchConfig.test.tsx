import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RssFetchConfig } from "../RssFetchConfig";

describe("RssFetchConfig", () => {
  it("renders feeds list and handles adding/updating/removing feeds", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <RssFetchConfig
        value={{
          feeds: [{ name: "Custom Blog", url: "https://example.com/rss.xml" }],
          max_per_feed: 8,
          max_items: 20,
        }}
        onChange={onChange}
        locale="zh"
      />,
    );

    expect(screen.getByDisplayValue("Custom Blog")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://example.com/rss.xml"),
    ).toBeInTheDocument();

    // Add Feed button
    const addBtn = screen.getByRole("button", { name: /添加订阅源/ });
    await user.click(addBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        feeds: [
          { name: "Custom Blog", url: "https://example.com/rss.xml" },
          { name: "", url: "" },
        ],
      }),
    );
  });

  it("allows clicking preset chips to add a feed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <RssFetchConfig
        value={{
          feeds: [{ name: "Custom Blog", url: "https://example.com/rss.xml" }],
        }}
        onChange={onChange}
        locale="zh"
      />,
    );

    const hackerNewsChip = screen.getByRole("button", {
      name: /\+ Hacker News Top/,
    });
    await user.click(hackerNewsChip);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        feeds: [
          { name: "Custom Blog", url: "https://example.com/rss.xml" },
          { name: "Hacker News", url: "https://hnrss.org/frontpage" },
        ],
      }),
    );
  });
});
