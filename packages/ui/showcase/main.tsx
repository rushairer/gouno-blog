import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AdminShell,
  AdminPage,
  PageHeader,
  Panel,
  PanelHeader,
  Button,
  Badge,
  Feedback,
  Field,
  Input,
  ThemeProvider,
  ThemeToggle,
  NavigationGroup,
  navigationItemClass,
} from "../src";
import "../src/tokens.css";
import "../src/base.css";

function Showcase() {
  const [saved, setSaved] = useState(false);
  return (
    <ThemeProvider brand="blog-admin" storageKey="gouno-ui-showcase:theme">
      <AdminShell
        brand="Gouno UI"
        toolbar={<ThemeToggle />}
        navigation={() => (
          <NavigationGroup label="展示">
            <a className={navigationItemClass} href="#foundations">基础组件</a>
            <a className={navigationItemClass} href="#forms">表单与反馈</a>
          </NavigationGroup>
        )}
      >
        <AdminPage>
          <PageHeader title="共享设计系统" description="Blog、Blog Admin 与 gosso-admin 共用的组件、令牌与后台模板。" />
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel id="foundations">
              <PanelHeader title="基础组件" description="多品牌语义颜色与状态组合。" />
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">主要操作</Button>
                <Button variant="secondary">次要操作</Button>
                <Button variant="danger">危险操作</Button>
                <Badge tone="success">已完成</Badge>
                <Badge tone="warning">待处理</Badge>
                <Badge tone="info">信息</Badge>
              </div>
            </Panel>
            <Panel id="forms">
              <PanelHeader title="表单与反馈" description="保持标签关联、错误播报与移动触控尺寸。" />
              <Field label="站点名称" description="用于后台导航与登录预览。">
                <Input defaultValue="Gouno Blog" />
              </Field>
              {saved ? <Feedback type="success">设置已保存。</Feedback> : null}
              <Button onClick={() => setSaved(true)}>保存设置</Button>
            </Panel>
          </div>
        </AdminPage>
      </AdminShell>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Showcase /></StrictMode>);
