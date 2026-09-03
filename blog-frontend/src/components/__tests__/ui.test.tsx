import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Plus } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  AsyncState,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  ChoiceButton,
  BulkActionBar,
  Drawer,
  EditorPanel,
  Field,
  FormActions,
  FormLayout,
  Input,
  IconButton,
  Modal,
  Pagination,
  SectionHeading,
  SectionNav,
  Select,
  Skeleton,
  StatusBadge,
  SubnavTabs,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TableSkeleton,
  ToastProvider,
  useToast,
} from "../ui";

describe("shared UI primitives", () => {
  it("connects Field labels, hints, errors, and required state to its control", () => {
    const { rerender } = render(
      <Field label="名称" hint="请输入站点名称" required>
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: /名称/ });
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription("请输入站点名称");

    rerender(
      <Field label="名称" error="名称不能为空">
        <Input />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: "名称" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByRole("textbox", { name: "名称" }),
    ).toHaveAccessibleDescription("名称不能为空");
  });

  it("renders Select with a shared chevron and compact control contract", () => {
    const { container } = render(
      <Select size="compact" aria-label="状态">
        <option>全部</option>
      </Select>,
    );
    expect(screen.getByRole("combobox", { name: "状态" })).toHaveClass(
      "ui-control--compact",
    );
    expect(
      container.querySelector(".select-control > svg"),
    ).toBeInTheDocument();
  });

  it("applies stable button variants and disabled loading behavior", () => {
    render(
      <Button variant="primary" loading>
        保存
      </Button>,
    );
    const button = screen.getByRole("button", { name: "保存" });
    expect(button).toHaveClass("btn-primary");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("places button icons in the shared fixed-size icon slot", () => {
    const { container } = render(
      <Button variant="primary" icon={<Plus data-testid="add-icon" />}>
        新建分类
      </Button>,
    );

    const button = screen.getByRole("button", { name: "新建分类" });
    expect(button.querySelector(".btn__icon")).toContainElement(
      screen.getByTestId("add-icon"),
    );
    expect(button.querySelector(".btn__label")).toHaveTextContent("新建分类");
    expect(
      container.querySelector(".btn > .btn__icon + .btn__label"),
    ).toBeInTheDocument();
  });

  it("keeps icon-only controls in a labelled fixed-size icon slot", () => {
    const { container } = render(
      <IconButton label="删除分类" variant="danger" icon={<Plus />} />,
    );
    const button = screen.getByRole("button", { name: "删除分类" });
    expect(button).toHaveClass("icon-button", "icon-button--danger");
    expect(button.querySelector(".icon-button__icon")).toBeInTheDocument();
    expect(
      container.querySelector(".icon-button__icon > svg"),
    ).toBeInTheDocument();
  });

  it("keeps selectable action chips in the shared pressed-button contract", () => {
    render(<ChoiceButton selected>摘要候选</ChoiceButton>);
    expect(screen.getByRole("button", { name: "摘要候选" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("gives navigation actions the same button and icon-slot contract", () => {
    render(
      <MemoryRouter>
        <ButtonLink variant="primary" to="/admin/posts/new" icon={<Plus />}>
          新建文章
        </ButtonLink>
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "新建文章" });
    expect(link).toHaveClass("btn", "btn-primary");
    expect(link.querySelector(".btn__icon")).toBeInTheDocument();
    expect(link.querySelector(".btn__label")).toHaveTextContent("新建文章");
  });

  it("keeps batch actions in one accessible toolbar with shared AI and cancel controls", async () => {
    const user = userEvent.setup();
    let assisted = false;
    let cancelled = false;
    render(
      <BulkActionBar
        selectionLabel="已选择 2 篇文章"
        onAIAssist={() => {
          assisted = true;
        }}
        onCancel={() => {
          cancelled = true;
        }}
      >
        <Button variant="danger" size="compact">
          删除
        </Button>
      </BulkActionBar>,
    );

    const toolbar = screen.getByRole("toolbar", { name: "批量操作" });
    expect(toolbar).toHaveTextContent("已选择 2 篇文章");
    expect(screen.getByRole("button", { name: "交给 AI" })).toHaveClass(
      "bulk-action-bar__ai",
    );
    expect(screen.getByRole("button", { name: "删除" })).toHaveClass(
      "btn-danger",
    );

    await user.click(screen.getByRole("button", { name: "交给 AI" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(assisted).toBe(true);
    expect(cancelled).toBe(true);
  });

  it("provides a shared editor panel, form layout, and surfaced action contract", () => {
    render(
      <EditorPanel
        title="创建项目"
        closeLabel="关闭编辑器"
        onClose={() => undefined}
      >
        <FormLayout aria-label="项目表单">
          <Field label="名称">
            <Input />
          </Field>
          <FormActions surface>
            <Button variant="primary">保存</Button>
          </FormActions>
        </FormLayout>
      </EditorPanel>,
    );
    expect(
      screen
        .getByRole("heading", { name: "创建项目" })
        .closest(".editor-panel"),
    ).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "项目表单" })).toHaveClass(
      "form-layout",
    );
    expect(screen.getByRole("button", { name: "关闭编辑器" })).toHaveClass(
      "icon-button",
    );
    expect(
      screen.getByRole("button", { name: "保存" }).parentElement,
    ).toHaveClass("form-actions--surface");
  });

  it("provides ARIA-connected tabs and keyboard navigation", async () => {
    const user = userEvent.setup();
    function Example() {
      const [value, setValue] = useState("one");
      return (
        <Tabs value={value} onValueChange={setValue} id="example">
          <TabList label="示例页签">
            <Tab value="one">页签一</Tab>
            <Tab value="two">页签二</Tab>
          </TabList>
          <TabPanel value="one">内容一</TabPanel>
          <TabPanel value="two">内容二</TabPanel>
        </Tabs>
      );
    }
    render(<Example />);
    const first = screen.getByRole("tab", { name: "页签一" });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "页签二" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("内容二");
  });

  it("uses the same accessible navigation behavior for page-local subnavigation", async () => {
    const user = userEvent.setup();
    function Example() {
      const [value, setValue] = useState("agents");
      return (
        <SubnavTabs
          label="高级设置"
          value={value}
          onValueChange={setValue}
          items={[
            { value: "agents", label: "Agents" },
            { value: "skills", label: "Skills" },
          ]}
        />
      );
    }
    render(<Example />);
    const agents = screen.getByRole("tab", { name: "Agents" });
    expect(agents).toHaveClass("subnav-tabs__tab");
    expect(agents).toHaveAttribute("aria-selected", "true");
    agents.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Skills" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders accessible section anchors with an active location", () => {
    render(
      <SectionNav
        label="设置分区"
        items={[
          { id: "basic", label: "基础信息" },
          { id: "seo", label: "SEO" },
        ]}
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "设置分区" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "基础信息" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(screen.getByRole("link", { name: "SEO" })).toHaveAttribute(
      "href",
      "#seo",
    );
  });

  it("renders Badge and StatusBadge with appropriate tone and semantic status classes", () => {
    const { rerender } = render(<Badge tone="brand">架构</Badge>);
    expect(screen.getByText("架构")).toHaveClass("badge", "badge--brand");

    rerender(<StatusBadge status="published" />);
    expect(screen.getByText("已发布")).toHaveClass(
      "status-badge",
      "status-badge--published",
    );

    rerender(<StatusBadge status="draft" />);
    expect(screen.getByText("草稿")).toHaveClass(
      "status-badge",
      "status-badge--draft",
    );
  });

  it("renders Pagination in numbers and compact mode with accessible ARIA labels", async () => {
    const user = userEvent.setup();
    let selectedPage = 1;
    const { rerender } = render(
      <Pagination
        page={1}
        pages={3}
        label="文章分页"
        onChange={(p) => {
          selectedPage = p;
        }}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "文章分页" });
    expect(nav).toHaveClass("pagination");
    const page2Button = screen.getByRole("button", { name: "2" });
    await user.click(page2Button);
    expect(selectedPage).toBe(2);

    rerender(
      <Pagination
        mode="compact"
        page={2}
        pages={5}
        label="资源分页"
        onChange={(p) => {
          selectedPage = p;
        }}
      />,
    );
    expect(screen.getByRole("navigation", { name: "资源分页" })).toHaveClass(
      "pagination-compact",
    );
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("renders, dismisses, and semantically classifies shared toasts", async () => {
    const user = userEvent.setup();
    function ToastExample() {
      const { notify } = useToast();
      return (
        <>
          <button type="button" onClick={() => notify("已保存")}>
            成功
          </button>
          <button
            type="button"
            onClick={() => notify("需要确认", "warning", { duration: 0 })}
          >
            警告
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <ToastExample />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "成功" }));
    await user.click(screen.getByRole("button", { name: "警告" }));
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    expect(screen.getByRole("alert")).toHaveTextContent("需要确认");
    expect(screen.getByRole("alert")).toHaveClass("toast--warning");

    await user.click(screen.getAllByRole("button", { name: "关闭提示" })[0]);
    expect(screen.queryByText("已保存")).not.toBeInTheDocument();
    expect(screen.getByText("需要确认")).toBeInTheDocument();
  });

  it("renders SectionHeading with title and optional action link", () => {
    render(
      <SectionHeading title="最新文章" action={<a href="/all">查看全部</a>} />,
    );
    expect(
      screen.getByRole("heading", { name: "最新文章" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看全部" })).toHaveAttribute(
      "href",
      "/all",
    );
  });

  it("keeps focus in input inside Drawer during typing across re-renders", async () => {
    const user = userEvent.setup();
    function DrawerFormTest() {
      const [open, setOpen] = useState(true);
      const [text, setText] = useState("");
      return (
        <Drawer open={open} title="新建分类" onClose={() => setOpen(false)}>
          <input
            aria-label="分类名称"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </Drawer>
      );
    }
    render(<DrawerFormTest />);
    const input = screen.getByRole("textbox", { name: "分类名称" });
    expect(document.activeElement).toBe(input);
    await user.type(input, "架构设计");
    expect(input).toHaveValue("架构设计");
    expect(document.activeElement).toBe(input);
  });

  it("keeps focus in input inside Modal during typing and closes on Escape", async () => {
    const user = userEvent.setup();
    let closed = false;
    function ModalFormTest() {
      const [open, setOpen] = useState(true);
      const [text, setText] = useState("");
      return (
        <Modal
          open={open}
          title="重命名标签"
          onClose={() => {
            closed = true;
            setOpen(false);
          }}
        >
          <input
            aria-label="标签名称"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Modal>
      );
    }
    render(<ModalFormTest />);
    const input = screen.getByRole("textbox", { name: "标签名称" });
    await user.click(input);
    await user.type(input, "React19");
    await user.keyboard("{Escape}");
    expect(closed).toBe(true);
  });

  it("renders Skeleton and TableSkeleton for zero-CLS loading states", () => {
    const { container } = render(
      <div>
        <Skeleton variant="text" width="80%" data-testid="skel-text" />
        <Skeleton variant="circular" width={32} height={32} />
        <TableSkeleton rows={3} columns={4} />
      </div>,
    );
    expect(screen.getByTestId("skel-text")).toHaveClass("skeleton--text");
    expect(
      screen.getByRole("status", { name: "正在载入数据…" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".table-skeleton-row")).toHaveLength(3);
  });

  it("handles loading, error retry, empty, and data states uniformly in AsyncState", async () => {
    const user = userEvent.setup();
    let retried = false;

    const { rerender } = render(
      <AsyncState loading skeleton={<div>Custom Skeleton</div>}>
        <div>Data Content</div>
      </AsyncState>,
    );
    expect(screen.getByText("Custom Skeleton")).toBeInTheDocument();

    rerender(
      <AsyncState
        loading={false}
        error="网络请求失败"
        onRetry={() => {
          retried = true;
        }}
      >
        <div>Data Content</div>
      </AsyncState>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("网络请求失败");
    const retryBtn = screen.getByRole("button", { name: "重试" });
    await user.click(retryBtn);
    expect(retried).toBe(true);

    rerender(
      <AsyncState loading={false} empty emptyTitle="暂无数据">
        <div>Data Content</div>
      </AsyncState>,
    );
    expect(screen.getByText("暂无数据")).toBeInTheDocument();

    rerender(
      <AsyncState loading={false}>
        <div>Data Content</div>
      </AsyncState>,
    );
    expect(screen.getByText("Data Content")).toBeInTheDocument();
  });

  it("renders Card with header, content, footer, variants and interactive states", () => {
    const { container } = render(
      <Card variant="elevated" padding="lg" interactive>
        <CardHeader
          title="Card Title"
          description="Card Description"
          action={<button type="button">Action</button>}
        />
        <CardContent>Card Body</CardContent>
        <CardFooter>Card Bottom</CardFooter>
      </Card>,
    );
    expect(screen.getByText("Card Title")).toBeInTheDocument();
    expect(screen.getByText("Card Description")).toBeInTheDocument();
    expect(screen.getByText("Card Body")).toBeInTheDocument();
    expect(screen.getByText("Card Bottom")).toBeInTheDocument();
    const cardEl = container.querySelector(".ui-card");
    expect(cardEl).toHaveClass(
      "ui-card--elevated",
      "ui-card--padding-lg",
      "ui-card--interactive",
    );
    expect(cardEl).toHaveAttribute("tabindex", "0");
  });
});
