import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Menu,
  Plus,
  Search,
  Settings,
  Shield,
} from "lucide-react";
import {
  AdminShell,
  AdminPage,
  ActionGroup,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  DataTable,
  DashboardTemplate,
  Feedback,
  Field,
  Input,
  NavigationGroup,
  PageHeader,
  Panel,
  PanelHeader,
  Select,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ThemeProvider,
  ThemeToggle,
  ToastProvider,
  navigationItemClass,
  type TableDensity,
} from "../src";
import { showcaseCatalog as nav } from "./catalog";
import { showcaseRecords as records } from "./fixtures";
import {
  StateControls,
  StatePanel,
  type DemoState as ScenarioState,
} from "./scenarios";
import { OverlayDemo } from "./overlays";
import "./showcase.css";

type DemoState = ScenarioState;
type Brand = "blog" | "blog-admin" | "gosso-admin";
type PreviewWidth = "full" | "desktop" | "tablet" | "mobile";

function Foundations() {
  const [density, setDensity] = useState<TableDensity>("default");
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageHeader
        title="共享设计系统"
        description="页面级 Demo 用于统一 Blog、Blog Admin 与 Gosso Admin 的布局、间距、状态和主题。"
        actions={
          <ActionGroup>
            <Button variant="primary" icon={<Plus />}>
              新增示例
            </Button>
            <ThemeToggle />
          </ActionGroup>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="基础控件"
            description="颜色、按钮、状态和反馈的统一语义。"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">主要操作</Button>
            <Button variant="secondary">次要操作</Button>
            <Button variant="danger">危险操作</Button>
            <Badge tone="success">已完成</Badge>
            <Badge tone="warning">待处理</Badge>
            <Badge tone="info">信息</Badge>
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="表单与反馈"
            description="标签、描述、错误和保存反馈保持一致。"
          />
          <Field label="站点名称" hint="用于后台导航和登录预览。">
            <Input defaultValue="Gouno Blog" />
          </Field>
          <div className="mt-4">
            {saved ? (
              <Feedback type="success">设置已保存。</Feedback>
            ) : (
              <Button onClick={() => setSaved(true)}>保存设置</Button>
            )}
          </div>
        </Panel>
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="表格密度"
            description="直接比较 Cell 内间距、行高和操作列行为。"
            actions={
              <Select
                aria-label="表格密度"
                value={density}
                onChange={(e) => setDensity(e.target.value as TableDensity)}
              >
                <option value="default">默认</option>
                <option value="compact">紧凑</option>
                <option value="touch">触控</option>
              </Select>
            }
          />
          <DataTable density={density}>
            <TableHeader>
              <TableRow>
                <TableHead>模块</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>说明</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(([name, status, type, date]) => (
                <TableRow key={name}>
                  <TableCell>
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-muted-foreground">{type}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      tone={
                        status === "已发布"
                          ? "success"
                          : status === "草稿"
                            ? "neutral"
                            : "warning"
                      }
                    >
                      {status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[320px] truncate">
                    最后更新于 {date}
                    ，这是用于验证长文本截断和表格内滚动的示例。
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm">查看</Button>
                      <Button size="sm" variant="ghost">
                        更多
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </Panel>
      </div>
    </>
  );
}

function ListDemo() {
  const [state, setState] = useState<DemoState>("ready");
  const [density, setDensity] = useState<TableDensity>("default");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const visible = records.filter((row) => row[0].includes(query));
  return (
    <>
      <PageHeader
        title="Posts 列表模板"
        description="筛选、批量操作、状态 Badge、分页和移动端列表的统一参考。"
        action={
          <Button variant="primary" icon={<Plus />}>
            新建文章
          </Button>
        }
      />
      <StateControls state={state} setState={setState} />
      <Panel>
        <PanelHeader
          title="全部文章"
          description={`${visible.length} 条结果 · 最后同步于刚刚`}
          actions={
            <Select
              aria-label="列表密度"
              value={density}
              onChange={(event) =>
                setDensity(event.target.value as TableDensity)
              }
            >
              <option value="default">默认密度</option>
              <option value="compact">紧凑密度</option>
              <option value="touch">触控密度</option>
            </Select>
          }
        />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field label="搜索" className="min-w-[240px]">
            <Input
              prefixIcon={<Search />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标题"
            />
          </Field>
          <ActionGroup>
            <Button variant="secondary">筛选</Button>
            <Button variant="ghost">导出</Button>
          </ActionGroup>
        </div>
        {selected.length > 0 ? (
          <Feedback type="info" className="mt-4">
            已选择 {selected.length} 项。
            <Button
              size="sm"
              variant="danger"
              className="ml-3"
              onClick={() => setState("success")}
            >
              批量归档
            </Button>
          </Feedback>
        ) : null}
        <div className="mt-5">
          <StatePanel state={state} onRetry={() => setState("ready")} />
          {state === "ready" || state === "success" ? (
            <>
              <div className="hidden md:block">
                <DataTable density={density}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <input
                          type="checkbox"
                          aria-label="全选"
                          onChange={(e) =>
                            setSelected(
                              e.target.checked ? visible.map((r) => r[0]) : [],
                            )
                          }
                        />
                      </TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>更新时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((row) => (
                      <TableRow key={row[0]}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`选择 ${row[0]}`}
                            checked={selected.includes(row[0])}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, row[0]]
                                  : selected.filter((x) => x !== row[0]),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="font-medium">{row[0]}</TableCell>
                        <TableCell>
                          <Badge
                            tone={row[1] === "已发布" ? "success" : "warning"}
                          >
                            {row[1]}
                          </Badge>
                        </TableCell>
                        <TableCell>{row[3]}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button size="sm">编辑</Button>
                            <Button size="sm" variant="ghost">
                              更多
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </div>
              <div className="grid gap-3 md:hidden">
                {visible.map((row) => (
                  <Card key={row[0]} padding="sm">
                    <CardContent>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{row[0]}</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {row[3]}
                          </div>
                        </div>
                        <Badge
                          tone={row[1] === "已发布" ? "success" : "warning"}
                        >
                          {row[1]}
                        </Badge>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm">编辑</Button>
                        <Button size="sm" variant="ghost">
                          更多
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  显示 {visible.length} / {records.length} 条
                </span>
                <ActionGroup>
                  <Button size="sm" variant="ghost" icon={<ChevronLeft />}>
                    上一页
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ChevronRight />}
                    iconPosition="right"
                  >
                    下一页
                  </Button>
                </ActionGroup>
              </div>
            </>
          ) : null}
        </div>
      </Panel>
    </>
  );
}

function EditorDemo() {
  const [state, setState] = useState<DemoState>("ready");
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<"dirty" | "saved" | "failed">(
    "dirty",
  );
  return (
    <>
      <PageHeader
        title="文章编辑器模板"
        description="命令栏、编辑画布、Inspector、预览和保存状态。"
        actions={
          <ActionGroup>
            <Button variant="secondary" onClick={() => setPreview(!preview)}>
              切换预览
            </Button>
            <Button variant="primary" onClick={() => setSaveState("saved")}>
              保存草稿
            </Button>
          </ActionGroup>
        }
      />
      <StateControls state={state} setState={setState} />
      <div className="grid gap-6 xl:grid-cols-[200px_minmax(0,1fr)_320px]">
        <Panel className="hidden xl:block">
          <PanelHeader title="大纲" description="文章结构" />
          <nav className="flex flex-col gap-2 text-sm">
            <a
              className="rounded-md bg-accent px-3 py-2 text-accent-foreground"
              href="#editor-title"
            >
              标题
            </a>
            <a
              className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted"
              href="#editor-body"
            >
              正文
            </a>
            <a
              className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted"
              href="#editor-meta"
            >
              元信息
            </a>
          </nav>
        </Panel>
        <Panel className="min-h-[520px]">
          <PanelHeader
            title={preview ? "预览" : "编辑内容"}
            description="Markdown、代码块和表格内容在画布内滚动。"
          />
          {saveState === "saved" ? (
            <Feedback type="success" className="mb-4">
              草稿已保存 · 刚刚
            </Feedback>
          ) : null}
          {saveState === "failed" ? (
            <Feedback type="error" className="mb-4">
              保存失败，请检查必填字段后重试。
            </Feedback>
          ) : null}
          {state === "ready" ? (
            preview ? (
              <article className="prose max-w-none">
                <h2>设计系统迁移计划</h2>
                <p>这是静态预览，用来验证阅读宽度、标题层级和内容间距。</p>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-4">
                  const density = "default";{`\n`}renderTable(density);
                </pre>
              </article>
            ) : (
              <div className="flex flex-col gap-4">
                <Field
                  label="标题"
                  id="editor-title"
                  hint="建议控制在 60 个字符以内。"
                >
                  <Input defaultValue="设计系统迁移计划" />
                </Field>
                <Field
                  label="正文"
                  id="editor-body"
                  hint="支持 Markdown 和富文本粘贴。"
                >
                  <textarea
                    className="min-h-64 w-full rounded-md border bg-input p-3 text-sm leading-7"
                    defaultValue="页面级 Demo 让每一个间距和状态都可以被直接评审。"
                  />
                </Field>
                <div id="editor-meta" className="grid gap-4 sm:grid-cols-2">
                  <Field label="摘要">
                    <Input defaultValue="统一页面视觉语言" />
                  </Field>
                  <Field label="作者">
                    <Select defaultValue="owner">
                      <option value="owner">Gouno Owner</option>
                      <option value="editor">Editorial Team</option>
                    </Select>
                  </Field>
                </div>
                <div className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-4 text-sm">
                  <div className="mb-2 font-medium">Markdown 表格预览内容</div>
                  <code className="whitespace-pre">{`| 状态 | 数量 |\n| --- | ---: |\n| 已发布 | 126 |\n| 草稿 | 32 |`}</code>
                </div>
              </div>
            )
          ) : (
            <StatePanel state={state} onRetry={() => setState("ready")} />
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Inspector" description="页面设置和发布选项。" />
          <div className="flex flex-col gap-4">
            <Field label="状态">
              <Select defaultValue="draft">
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
              </Select>
            </Field>
            <Field label="摘要">
              <Input defaultValue="统一页面视觉语言" />
            </Field>
            <Feedback type={saveState === "dirty" ? "warning" : "success"}>
              {saveState === "dirty"
                ? "有未保存的修改。"
                : "所有修改都已保存。"}
            </Feedback>
            <ActionGroup>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSaveState("dirty")}
              >
                标记未保存
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setSaveState("failed")}
              >
                模拟保存失败
              </Button>
            </ActionGroup>
          </div>
        </Panel>
      </div>
    </>
  );
}

function DashboardDemo({ gosso = false }: { gosso?: boolean }) {
  const [state, setState] = useState<DemoState>("ready");
  return (
    <DashboardTemplate
      title={gosso ? "系统状态" : "早上好，Gouno"}
      description={
        gosso
          ? "服务健康度、运行版本和最近系统事件。"
          : "这里是你的内容工作台，查看今天的发布进度和需要关注的事项。"
      }
      actions={
        <ActionGroup>
          <Button variant="secondary">查看站点</Button>
          <Button variant="primary" icon={<Plus />}>
            新建文章
          </Button>
        </ActionGroup>
      }
      stateControls={<StateControls state={state} setState={setState} />}
    >
      {state !== "ready" ? (
        <Panel>
          <StatePanel state={state} onRetry={() => setState("ready")} />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["本月阅读", "28.4k", "+18.6%", "较上月", "up"],
              ["已发布", "126", "+24", "本月新增", "up"],
              ["待处理", "18", "4", "需要关注", "warn"],
              ["草稿", "32", "6", "最近 7 天", "neutral"],
            ].map(([label, value, change, hint, tone]) => (
              <Card key={label} className="relative overflow-hidden">
                <div className="absolute right-5 top-5 rounded-full bg-accent p-2 text-primary">
                  <BarChart3 className="size-4" />
                </div>
                <CardHeader title={label} />
                <CardContent>
                  <div className="mt-4 text-3xl font-semibold tracking-tight">
                    {value}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <span
                      className={
                        tone === "warn"
                          ? "text-warning"
                          : tone === "neutral"
                            ? "text-muted-foreground"
                            : "text-success"
                      }
                    >
                      {change}
                    </span>
                    {tone === "up" ? (
                      <ArrowUpRight className="size-4 text-success" />
                    ) : null}
                    <span className="text-muted-foreground">{hint}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel>
              <PanelHeader
                title="内容表现"
                description="过去 7 天的阅读和发布趋势。"
                actions={
                  <Button size="sm" variant="ghost">
                    查看分析
                  </Button>
                }
              />
              <div className="mt-5 flex h-48 items-end gap-2 rounded-lg bg-muted/40 px-4 pb-4 pt-6 sm:gap-4">
                {[35, 52, 44, 70, 58, 82, 66, 92, 75, 88, 78, 96].map(
                  (height, index) => (
                    <div
                      key={index}
                      className="group flex h-full flex-1 flex-col justify-end gap-2"
                    >
                      <div
                        className="h-full rounded-t-sm bg-primary/20 transition-colors group-hover:bg-primary/50"
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-center text-[11px] text-muted-foreground">
                        {index % 2 === 0 ? `周${index / 2 + 1}` : ""}
                      </span>
                    </div>
                  ),
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-primary" />
                  阅读量
                </span>
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-success" />
                  发布量
                </span>
                <span className="ml-auto font-medium text-foreground">
                  +18.6% 较上周
                </span>
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="快捷操作" description="常用工作流" />
              <div className="mt-2 flex flex-col gap-2">
                <Button
                  className="justify-start"
                  variant="ghost"
                  icon={<Plus />}
                >
                  创建新文章
                </Button>
                <Button
                  className="justify-start"
                  variant="ghost"
                  icon={<FileText />}
                >
                  管理页面
                </Button>
                <Button
                  className="justify-start"
                  variant="ghost"
                  icon={<Settings />}
                >
                  站点设置
                </Button>
                <Button
                  className="justify-start"
                  variant="ghost"
                  icon={<Shield />}
                >
                  查看审核队列
                </Button>
              </div>
            </Panel>
          </div>
          <Panel>
            <PanelHeader
              title="最近活动"
              description="按时间倒序排列的内容和系统事件。"
              action={
                <Button size="sm" variant="ghost">
                  查看全部
                </Button>
              }
            />
            <div className="grid gap-1 md:grid-cols-2">
              {records.map(([name, status, type, date], index) => (
                <div
                  key={name}
                  className="flex items-start gap-3 rounded-md p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="mt-0.5 rounded-full bg-success-subtle p-1.5 text-success">
                    {index === 2 ? (
                      <Clock3 className="size-3.5" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{name}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {type} · {date}
                    </div>
                  </div>
                  <Badge tone={status === "已发布" ? "success" : "warning"}>
                    {status}
                  </Badge>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </DashboardTemplate>
  );
}

function AccountDemo({ login = false }: { login?: boolean }) {
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader
        title={login ? "登录与 MFA" : "账户设置"}
        description={
          login
            ? "OIDC、密码和 MFA 状态的静态参考。"
            : "个人资料、安全设置和会话管理。"
        }
      />
      <Panel>
        {submitted ? (
          <Feedback type="success">操作成功，状态已更新。</Feedback>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label={login ? "邮箱" : "显示名称"} required>
              <Input
                defaultValue={login ? "owner@example.com" : "Gouno Owner"}
              />
            </Field>
            <Field label="密码" required>
              <Input type="password" defaultValue="password" />
            </Field>
            <Feedback type="info">
              这是静态 Demo，不会发送网络请求或读取认证信息。
            </Feedback>
            <ActionGroup>
              <Button variant="primary" onClick={() => setSubmitted(true)}>
                {login ? "登录" : "保存设置"}
              </Button>
              <Button variant="ghost">取消</Button>
            </ActionGroup>
          </div>
        )}
      </Panel>
    </div>
  );
}

function App() {
  const [page, setPage] = useState(() => {
    const candidate = window.location.hash.slice(1);
    return nav
      .flatMap((group) => group.items)
      .some((item) => item.id === candidate)
      ? candidate
      : "foundations";
  });
  const [brand, setBrand] = useState<Brand>("blog-admin");
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("full");
  const current = useMemo(
    () => nav.flatMap((g) => g.items).find((item) => item.id === page),
    [page],
  );
  useEffect(() => {
    const onHashChange = () => {
      const candidate = window.location.hash.slice(1);
      if (
        nav
          .flatMap((group) => group.items)
          .some((item) => item.id === candidate)
      ) {
        setPage(candidate);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const render = () => {
    switch (page) {
      case "foundations":
        return <Foundations />;
      case "overlays":
        return <OverlayDemo />;
      case "blog-home":
        return <DashboardDemo />;
      case "blog-account":
        return <AccountDemo />;
      case "admin-dashboard":
        return <DashboardDemo />;
      case "admin-list":
      case "admin-taxonomy":
      case "admin-media":
        return <ListDemo />;
      case "admin-editor":
        return <EditorDemo />;
      case "admin-settings":
        return <EditorDemo />;
      case "gosso-login":
        return <AccountDemo login />;
      case "gosso-account":
        return <AccountDemo />;
      case "gosso-system":
        return <DashboardDemo gosso />;
      case "gosso-audit":
        return <ListDemo />;
      default:
        return <Foundations />;
    }
  };
  return (
    <ThemeProvider brand={brand} storageKey="gouno-ui-showcase:theme">
      <ToastProvider>
        <AdminShell
          brand={
            <button
              className="font-semibold text-primary"
              onClick={() => setPage("foundations")}
            >
              Gouno UI Demo
            </button>
          }
          toolbar={
            <ActionGroup>
              <Select
                aria-label="品牌"
                value={brand}
                onChange={(e) => setBrand(e.target.value as Brand)}
              >
                <option value="blog">Blog</option>
                <option value="blog-admin">Blog Admin</option>
                <option value="gosso-admin">Gosso Admin</option>
              </Select>
              <Select
                aria-label="预览宽度"
                value={previewWidth}
                onChange={(event) =>
                  setPreviewWidth(event.target.value as PreviewWidth)
                }
              >
                <option value="full">全宽</option>
                <option value="desktop">桌面 1024</option>
                <option value="tablet">平板 768</option>
                <option value="mobile">移动 390</option>
              </Select>
              <ThemeToggle />
            </ActionGroup>
          }
          navigation={() => (
            <>
              {nav.map((group) => (
                <NavigationGroup key={group.group} label={group.group}>
                  {group.items.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`${navigationItemClass} ${page === item.id ? "active" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        window.location.hash = item.id;
                        setPage(item.id);
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </a>
                  ))}
                </NavigationGroup>
              ))}
            </>
          )}
        >
          <AdminPage
            style={{
              maxWidth:
                previewWidth === "desktop"
                  ? 1024
                  : previewWidth === "tablet"
                    ? 768
                    : previewWidth === "mobile"
                      ? 390
                      : undefined,
            }}
          >
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Menu className="size-4" />
              页面 Demo / {current?.label} / 预览：
              {
                {
                  full: "全宽",
                  desktop: "1024px",
                  tablet: "768px",
                  mobile: "390px",
                }[previewWidth]
              }
            </div>
            {render()}
          </AdminPage>
        </AdminShell>
      </ToastProvider>
    </ThemeProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
