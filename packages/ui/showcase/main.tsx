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
  EditorWorkspaceTemplate,
  FilterBar,
  Feedback,
  Field,
  Input,
  ListPageTemplate,
  Modal,
  NavigationGroup,
  PageHeader,
  Panel,
  PanelHeader,
  Select,
  ResponsiveList,
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
import { gossoUsers } from "./fixtures";
import {
  StateControls,
  StatePanel,
  type DemoState as ScenarioState,
} from "./scenarios";
import { OverlayDemo } from "./overlays";
import "./showcase.css";

type DemoState = ScenarioState;
type Brand = "blog" | "blog-admin" | "gosso-admin";
type Workspace = "gouno-ui" | Brand;
type PreviewWidth = "full" | "desktop" | "tablet" | "mobile";

function workspaceForPage(page: string): Workspace {
  if (page.startsWith("blog-")) return "blog";
  if (page.startsWith("admin-")) return "blog-admin";
  if (page.startsWith("gosso-")) return "gosso-admin";
  return "gouno-ui";
}

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
          <PanelHeader title="状态提示与 Box 间距" description="基础提示统一图标、文字、操作对齐和项目间距。" />
          <div className="flex flex-col gap-3">
            <Feedback type="success">操作已完成。</Feedback>
            <Feedback type="error"><span>需要修正后才能继续。</span><Button size="sm">重新载入</Button></Feedback>
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

function ListDemo({ kind = "posts" }: { kind?: "posts" | "users" | "clients" | "audit" }) {
  const [state, setState] = useState<DemoState>("ready");
  const [density, setDensity] = useState<TableDensity>("default");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const source = kind === "users"
    ? [["admin@example.com", "管理员", "活跃", "2026-09-06"], ["editor@example.com", "编辑", "活跃", "2026-09-05"], ["suspended@example.com", "审核员", "已停用", "2026-09-02"]]
    : kind === "clients"
      ? [["blog-bff", "Confidential", "https://blog.dev.local/callback", "openid profile"], ["admin-console", "Public", "https://admin.dev.local/callback", "openid admin"]]
      : kind === "audit"
        ? [["登录成功", "admin@example.com", "认证", "2026-09-06 15:24"], ["更新客户端", "admin@example.com", "客户端", "2026-09-06 14:18"], ["撤销会话", "ops@example.com", "会话", "2026-09-06 11:02"]]
        : records;
  const visible = source.filter((row) => row[0].includes(query));
  const copy = kind === "users" ? ["用户管理", "管理用户、角色、MFA 和账户状态。", "用户列表", "创建用户"] : kind === "clients" ? ["客户端管理", "管理 OAuth 客户端、回调地址和授权范围。", "已注册客户端", "注册客户端"] : kind === "audit" ? ["审计日志", "按时间查看认证与系统管理事件。", "最近事件", "导出日志"] : ["Posts 列表模板", "筛选、批量操作、状态 Badge、分页和移动端列表的统一参考。", "全部文章", "新建文章"];
  return (
    <ListPageTemplate
      title={copy[0]}
      description={copy[1]}
      action={
        <Button variant="primary" icon={<Plus />}>
          {copy[3]}
        </Button>
      }
      stateControls={<StateControls state={state} setState={setState} />}
    >
      <Panel data-density={density} className="posts-list-surface">
        <PanelHeader
          title={copy[2]}
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
        <FilterBar className="posts-filter-bar">
          <Field label="搜索" className="w-full min-w-0 md:max-w-[34rem] md:flex-1" hideLabel>
            <Input
              prefixIcon={<Search />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标题"
            />
          </Field>
          <ActionGroup className="w-full md:w-auto">
            <Button className="flex-1 md:flex-none" variant="secondary">筛选</Button>
            <Button className="flex-1 md:flex-none" variant="ghost">导出</Button>
          </ActionGroup>
        </FilterBar>
        {selected.length > 0 ? (
          <Feedback type="info">
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
        <>
          <StatePanel state={state} onRetry={() => setState("ready")} />
          {state === "ready" || state === "success" ? (
            <>
              <ResponsiveList
                density={density}
                table={
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
                }
                mobile={
                  <>
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
                  </>
                }
              />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
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
        </>
      </Panel>
    </ListPageTemplate>
  );
}

function GossoUsersDemo() {
  const [state, setState] = useState<DemoState>("ready");
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<string | null>(null);
  return <ListPageTemplate title="用户管理" description="管理用户、角色、MFA 和账户状态。" action={<Button variant="primary" icon={<Plus />}>添加用户</Button>} stateControls={<StateControls state={state} setState={setState} />}>
    {state !== "ready" ? <Panel><StatePanel state={state} onRetry={() => setState("ready")} /></Panel> : <Panel><PanelHeader title="用户" description={`${gossoUsers.length} 个账户`} /><FilterBar><Field label="搜索" hideLabel><Input prefixIcon={<Search />} placeholder="搜索用户名或邮箱" /></Field><Button variant="secondary">筛选</Button></FilterBar><DataTable><TableHeader><TableRow><TableHead><input type="checkbox" aria-label="全选" onChange={e => setSelected(e.target.checked ? gossoUsers.map(u => u.id) : [])} /></TableHead><TableHead>用户</TableHead><TableHead>状态</TableHead><TableHead>角色</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{gossoUsers.map(user => <TableRow key={user.id}><TableCell><input type="checkbox" aria-label={`选择 ${user.username}`} checked={selected.includes(user.id)} onChange={e => setSelected(s => e.target.checked ? [...s,user.id] : s.filter(id => id !== user.id))} /></TableCell><TableCell><div className="font-medium">{user.display_name}</div><div className="text-xs text-muted-foreground">{user.username} · {user.id}</div></TableCell><TableCell><Badge tone={user.status === "active" ? "success" : "danger"}>{user.status === "active" ? "活跃" : "已停用"}</Badge></TableCell><TableCell><div className="flex flex-wrap gap-1">{user.roles?.map(r => <Badge key={r.id} tone="neutral" title={r.description}>{r.name}</Badge>)}</div></TableCell><TableCell><ActionGroup><Button size="sm" variant="secondary" onClick={() => setDialog(`角色：${user.display_name}`)}>角色</Button><Button size="sm" variant="secondary" onClick={() => setDialog(`安全操作：${user.display_name}`)}>安全</Button><Button size="sm" variant="danger" onClick={() => setDialog(`删除：${user.display_name}`)}>删除</Button></ActionGroup></TableCell></TableRow>)}</TableBody></DataTable></Panel>}
    <Modal open={Boolean(dialog)} onOpenChange={open => !open && setDialog(null)} title={dialog ?? "用户操作"}><div className="space-y-4"><p className="text-sm text-muted-foreground">静态模拟 Gosso Admin 的确认、角色、密码、MFA、锁定和删除操作。</p><Button variant="secondary" onClick={() => setDialog(null)}>取消</Button><Button variant="primary" onClick={() => { setDialog(null); setState("success"); }}>确认</Button></div></Modal>
  </ListPageTemplate>;
}

function EditorDemo() {
  const [state, setState] = useState<DemoState>("ready");
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<"dirty" | "saved" | "failed" | "conflict">(
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
      {state === "ready" ? (
      <EditorWorkspaceTemplate
        outline={
          <>
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
          </>
        }
        canvas={
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
          {preview ? (
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
          )}
        </Panel>
        }
        inspector={
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
            <Feedback
              type={
                saveState === "dirty"
                  ? "warning"
                  : saveState === "failed"
                    ? "error"
                    : "success"
              }
            >
              {saveState === "dirty"
                ? "有未保存的修改。"
                : saveState === "failed"
                  ? "保存失败，修改仍保留在本地。"
                  : saveState === "conflict"
                    ? "检测到版本冲突，提交已暂停。"
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
              <Button size="sm" variant="secondary" onClick={() => setSaveState("conflict")}>
                模拟版本冲突
              </Button>
            </ActionGroup>
          </div>
        </Panel>
        }
      />
      ) : (
        <Panel>
          <StatePanel state={state} onRetry={() => setState("ready")} />
        </Panel>
      )}
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
              ...(gosso
                ? [
                    ["运行服务", "12", "全部正常", "当前集群", "up"],
                    ["活跃用户", "1,284", "+8.2%", "较上周", "up"],
                    ["客户端", "36", "2", "待审核", "warn"],
                    ["审计事件", "248", "过去 24h", "最近活动", "neutral"],
                  ]
                : [
                    ["本月阅读", "28.4k", "+18.6%", "较上月", "up"],
                    ["已发布", "126", "+24", "本月新增", "up"],
                    ["待处理", "18", "4", "需要关注", "warn"],
                    ["草稿", "32", "6", "最近 7 天", "neutral"],
                  ]),
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
                title={gosso ? "系统健康度" : "内容表现"}
                description={gosso ? "服务、数据库和队列的实时状态。" : "过去 7 天的阅读趋势。"}
                actions={
                  <Button size="sm" variant="ghost">
                  {gosso ? "查看详情" : "查看分析"}
                  </Button>
                }
              />
              <div className="flex h-48 items-end gap-2 rounded-lg bg-muted/40 px-4 pb-4 pt-6 sm:gap-4">
                {[35, 52, 44, 70, 58, 82, 96].map(
                  (height, index) => (
                    <div
                      key={index}
                      className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2"
                    >
                      <div
                        className="h-full rounded-t-sm bg-primary/70 transition-colors group-hover:bg-primary"
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-center text-[11px] text-muted-foreground">
                        {["周一", "周二", "周三", "周四", "周五", "周六", "周日"][index]}
                      </span>
                    </div>
                  ),
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-primary" />
                  阅读量
                </span>
                <span className="ml-auto font-medium text-foreground">
                  +18.6% 较上周
                </span>
              </div>
            </Panel>
            <Panel>
              <PanelHeader title={gosso ? "管理入口" : "快捷操作"} description={gosso ? "常用系统管理操作" : "常用工作流"} />
              <div className="flex flex-col gap-2">
                <Button
                  className="justify-start"
                  variant="ghost"
                  icon={<Plus />}
                >
                  {gosso ? "管理用户" : "创建新文章"}
                </Button>
                <Button
                  className="justify-start"
                  variant="ghost"
                  icon={<FileText />}
                >
                  {gosso ? "管理客户端" : "管理页面"}
                </Button>
                <Button
                  className="justify-start"
                  variant="ghost"
                  icon={<Settings />}
                >
                  {gosso ? "站点设置" : "站点设置"}
                </Button>
                <Button
                  className="justify-start"
                  variant="ghost"
                  icon={<Shield />}
                >
                  {gosso ? "查看审计日志" : "查看审核队列"}
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
                  <Badge tone={status === "已发布" ? "success" : status === "草稿" ? "neutral" : "warning"}>
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
  const params = new URLSearchParams(window.location.search);
  const embedded = params.get("embedded") === "1";
  const embeddedPreview = params.get("preview") as PreviewWidth | null;
  const [page, setPage] = useState(() => {
    const candidate = window.location.hash.slice(1);
    return nav
      .flatMap((group) => group.items)
      .some((item) => item.id === candidate)
      ? candidate
      : "foundations";
  });
  const [brand, setBrand] = useState<Brand>(() => {
    const candidate = params.get("brand");
    if (
      candidate === "blog" ||
      candidate === "blog-admin" ||
      candidate === "gosso-admin"
    )
      return candidate;
    const initialWorkspace = workspaceForPage(window.location.hash.slice(1));
    return initialWorkspace === "gouno-ui" ? "blog-admin" : initialWorkspace;
  });
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    const candidate = params.get("workspace");
    return candidate === "blog" ||
      candidate === "blog-admin" ||
      candidate === "gosso-admin" ||
      candidate === "gouno-ui"
      ? candidate
      : workspaceForPage(window.location.hash.slice(1));
  });
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("full");
  const current = useMemo(
    () => nav.flatMap((g) => g.items).find((item) => item.id === page),
    [page],
  );
  const workspaceLabel =
    workspace === "gouno-ui"
      ? "Gouno UI"
      : workspace === "blog"
        ? "Blog"
        : workspace === "blog-admin"
          ? "Blog Admin"
          : "Gosso Admin";
  const workspaceGroup =
    workspace === "gouno-ui"
      ? "Foundations"
      : workspace === "blog"
      ? "Blog 公共"
      : workspace === "blog-admin"
        ? "Blog Admin"
        : "Gosso Admin";
  const navigationGroups = nav.filter((group) => group.group === workspaceGroup);
  const switchWorkspace = (nextWorkspace: Workspace) => {
    setWorkspace(nextWorkspace);
    if (nextWorkspace !== "gouno-ui") setBrand(nextWorkspace);
    const nextGroup =
      nextWorkspace === "gouno-ui"
        ? "Foundations"
        : nextWorkspace === "blog"
        ? "Blog 公共"
        : nextWorkspace === "blog-admin"
          ? "Blog Admin"
          : "Gosso Admin";
    const belongsToWorkspace = nav
      .find((group) => group.group === nextGroup)
      ?.items.some((item) => item.id === page);
    if (!belongsToWorkspace) {
      const defaultPage =
        nextWorkspace === "gouno-ui"
          ? "foundations"
          : nextWorkspace === "blog"
          ? "blog-home"
          : nextWorkspace === "blog-admin"
            ? "admin-dashboard"
            : "gosso-system";
      window.location.hash = defaultPage;
      setPage(defaultPage);
    }
  };
  useEffect(() => {
    const onHashChange = () => {
      const candidate = window.location.hash.slice(1);
      if (
        nav
          .flatMap((group) => group.items)
          .some((item) => item.id === candidate)
      ) {
        setPage(candidate);
        const nextWorkspace = workspaceForPage(candidate);
        setWorkspace(nextWorkspace);
        if (nextWorkspace !== "gouno-ui") setBrand(nextWorkspace);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    if (!embedded) window.scrollTo({ top: 0 });
  }, [embedded, previewWidth]);
  useEffect(() => {
    if (embedded && window.parent !== window)
      window.parent.postMessage(
        { type: "gouno-showcase:navigate", page },
        window.location.origin,
      );
  }, [embedded, page]);
  useEffect(() => {
    if (embedded) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "gouno-showcase:navigate") {
        const nextPage = String(event.data.page || "");
        if (
          nav
            .flatMap((group) => group.items)
            .some((item) => item.id === nextPage)
        ) {
          setPage(nextPage);
          window.history.replaceState(null, "", `#${nextPage}`);
        }
      }
      if (event.data?.type === "gouno-showcase:brand")
        setBrand(event.data.brand as Brand);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embedded]);
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
      case "gosso-users":
        return <GossoUsersDemo />;
      case "gosso-clients":
        return <ListDemo kind="clients" />;
      case "gosso-audit":
        return <ListDemo kind="audit" />;
      case "gosso-settings":
        return <EditorDemo />;
      case "gosso-status":
        return <DashboardDemo gosso />;
      default:
        return <Foundations />;
    }
  };
  const workspaceControl = (
      <Select
        aria-label="产品空间"
        size="compact"
        value={workspace}
        onChange={(e) => switchWorkspace(e.target.value as Workspace)}
      >
        <option value="gouno-ui">Gouno UI</option>
        <option value="blog">Blog</option>
        <option value="blog-admin">Blog Admin</option>
        <option value="gosso-admin">Gosso Admin</option>
      </Select>
  );
  const viewportControl = (
    <Select
      aria-label="预览宽度"
      size="compact"
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
  );
  const themeColorControl = workspace === "gouno-ui" ? (
    <Select
      aria-label="Gouno UI 主题色"
      value={brand}
      onChange={(event) => {
        const nextBrand = event.target.value as Brand;
        setBrand(nextBrand);
        if (embedded && window.parent !== window)
          window.parent.postMessage(
            { type: "gouno-showcase:brand", brand: nextBrand },
            window.location.origin,
          );
      }}
    >
      <option value="blog">Blog 蓝</option>
      <option value="blog-admin">Blog Admin 青</option>
      <option value="gosso-admin">Gosso Admin 紫</option>
    </Select>
  ) : null;
  const shellControls = (
    <ActionGroup>
      {themeColorControl}
      <ThemeToggle />
    </ActionGroup>
  );
  const navigation = (close: () => void) => (
    <>
      {navigationGroups.map((group) => (
        <NavigationGroup key={group.group} label={group.group}>
          {group.items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={page === item.id ? "page" : undefined}
              className={`${navigationItemClass} ${page === item.id ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                window.location.hash = item.id;
                setPage(item.id);
                close();
              }}
            >
              {item.icon}
              {item.label}
            </a>
          ))}
        </NavigationGroup>
      ))}
    </>
  );
  return (
    <ThemeProvider brand={brand} storageKey="gouno-ui-showcase:theme">
      <ToastProvider>
        {!embedded ? (
          <div className="h-dvh overflow-hidden bg-background text-foreground">
            <header className="flex h-12 items-center justify-between gap-3 border-b border-primary/20 bg-sidebar px-3 text-sidebar-foreground shadow-sm lg:px-4">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary">
                <span className="size-2 rounded-full bg-primary" />
                Gouno UI Showcase
              </div>
              <ActionGroup>
                {workspaceControl}
                {viewportControl}
              </ActionGroup>
            </header>
            <main
              className={
                previewWidth === "full"
                  ? "h-[calc(100dvh-48px)] min-w-0"
                  : "h-[calc(100dvh-48px)] min-w-0 overflow-auto bg-muted/30 p-4 lg:p-6"
              }
            >
              <iframe
                key={`${page}-${workspace}-${brand}-${previewWidth}`}
                title={`${current?.label ?? "页面"} ${previewWidth} 视口预览`}
                src={`${window.location.pathname}?embedded=1&workspace=${workspace}&brand=${brand}&preview=${previewWidth}#${page}`}
                className={
                  previewWidth === "full"
                    ? "block h-full w-full border-0 bg-background"
                    : "mx-auto block rounded-lg border bg-background shadow-sm"
                }
                style={{
                  boxSizing: previewWidth === "full" ? "border-box" : "content-box",
                  width:
                    previewWidth === "full"
                      ? "100%"
                      : previewWidth === "desktop"
                      ? 1024
                      : previewWidth === "tablet"
                        ? 768
                        : 390,
                  height:
                    previewWidth === "full"
                      ? "100%"
                      : previewWidth === "desktop"
                      ? 768
                      : previewWidth === "tablet"
                        ? 1024
                        : 844,
                }}
              />
            </main>
          </div>
        ) : (
        <AdminShell
          brand={
            embedded ? (
              <span className="font-semibold text-primary">{workspaceLabel}</span>
            ) : (
              <button
                className="font-semibold text-primary"
                onClick={() => setPage("foundations")}
              >
                Gouno UI Demo
              </button>
            )
          }
          toolbar={shellControls}
          navigation={navigation}
        >
          <AdminPage>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Menu className="size-4" />
              页面 Demo / {current?.label} / 预览：
              {
                {
                  full: "全宽",
                  desktop: "1024px",
                  tablet: "768px",
                  mobile: "390px",
                }[embeddedPreview || previewWidth]
              }
            </div>
            {render()}
          </AdminPage>
        </AdminShell>
        )}
      </ToastProvider>
    </ThemeProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
