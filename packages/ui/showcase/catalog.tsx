import type { ReactNode } from "react";
import {
  Activity,
  FileText,
  LayoutDashboard,
  Lock,
  Settings,
  Shield,
  Users,
} from "lucide-react";

export type ShowcaseBrand = "blog" | "blog-admin" | "gosso-admin";
export type ShowcasePage = { id: string; label: string; icon: ReactNode };

export const showcaseCatalog: { group: string; items: ShowcasePage[] }[] = [
  {
    group: "Foundations",
    items: [
      { id: "foundations", label: "基础组件", icon: <LayoutDashboard /> },
      { id: "overlays", label: "状态与弹层", icon: <Activity /> },
    ],
  },
  {
    group: "Blog 公共",
    items: [
      { id: "blog-home", label: "首页与阅读", icon: <FileText /> },
      { id: "blog-account", label: "账户状态", icon: <Users /> },
    ],
  },
  {
    group: "Blog Admin",
    items: [
      { id: "admin-dashboard", label: "Dashboard", icon: <LayoutDashboard /> },
      { id: "admin-list", label: "文章与页面列表", icon: <FileText /> },
      { id: "admin-taxonomy", label: "分类、标签与评论", icon: <FileText /> },
      { id: "admin-media", label: "媒体库", icon: <FileText /> },
      { id: "admin-editor", label: "编辑器", icon: <Activity /> },
      { id: "admin-settings", label: "设置与 AI", icon: <Settings /> },
    ],
  },
  {
    group: "Gosso Admin",
    items: [
      { id: "gosso-login", label: "登录与 MFA", icon: <Lock /> },
      { id: "gosso-account", label: "账户设置", icon: <Users /> },
      { id: "gosso-system", label: "系统管理", icon: <Shield /> },
      { id: "gosso-users", label: "用户管理", icon: <Users /> },
      { id: "gosso-clients", label: "客户端管理", icon: <Shield /> },
      { id: "gosso-audit", label: "审计日志", icon: <FileText /> },
      { id: "gosso-settings", label: "站点设置", icon: <Settings /> },
      { id: "gosso-status", label: "系统状态", icon: <Activity /> },
    ],
  },
];
