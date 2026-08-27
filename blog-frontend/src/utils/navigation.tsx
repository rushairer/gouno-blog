import type { ReactNode } from "react";
import {
  BarChart3,
  Bell,
  Bot,
  FileCode,
  FileText,
  FolderTree,
  Image,
  MessageSquare,
  Settings,
  Tags,
  Users,
} from "lucide-react";

export interface AdminNavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

export const publicNavigation = [
  { label: "文章", path: "/articles" },
  { label: "分类", path: "/categories" },
  { label: "归档", path: "/archive" },
  { label: "关于", path: "/about" },
];

export const adminNavigation: Array<{ label: string; items: AdminNavItem[] }> =
  [
    {
      label: "内容管理",
      items: [
        { label: "数据概览", path: "/admin/dashboard", icon: <BarChart3 /> },
        { label: "文章", path: "/admin/posts", icon: <FileText /> },
        { label: "单页", path: "/admin/pages", icon: <FileCode /> },
        { label: "分类", path: "/admin/categories", icon: <FolderTree /> },
        { label: "标签", path: "/admin/tags", icon: <Tags /> },
        { label: "媒体库", path: "/admin/media", icon: <Image /> },
      ],
    },
    {
      label: "互动管理",
      items: [
        { label: "评论", path: "/admin/comments", icon: <MessageSquare /> },
        { label: "通知中心", path: "/admin/notifications", icon: <Bell /> },
        { label: "AI 运营", path: "/admin/ai-ops", icon: <Bot /> },
      ],
    },
    {
      label: "站点管理",
      items: [
        { label: "站点设置", path: "/admin/settings", icon: <Settings /> },
        { label: "成员与权限", path: "/admin/users", icon: <Users /> },
      ],
    },
  ];
