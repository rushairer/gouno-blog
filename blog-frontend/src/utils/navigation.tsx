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
  Settings2,
  Tags,
  Users,
} from "lucide-react";

export interface AdminNavItem {
  label: string;
  path: string;
  icon: ReactNode;
  permissions?: string[];
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
      label: "Content 内容管理",
      items: [
        { label: "数据概览", path: "/admin/dashboard", icon: <BarChart3 /> },
        {
          label: "文章",
          path: "/admin/posts",
          icon: <FileText />,
          permissions: ["content.author", "content.manage"],
        },
        {
          label: "分类",
          path: "/admin/categories",
          icon: <FolderTree />,
          permissions: ["content.manage"],
        },
        {
          label: "标签",
          path: "/admin/tags",
          icon: <Tags />,
          permissions: ["content.manage"],
        },
        {
          label: "单页",
          path: "/admin/pages",
          icon: <FileCode />,
          permissions: ["content.manage"],
        },
        {
          label: "评论",
          path: "/admin/comments",
          icon: <MessageSquare />,
          permissions: ["community.moderate"],
        },
        { label: "通知中心", path: "/admin/notifications", icon: <Bell /> },
        {
          label: "媒体库",
          path: "/admin/media",
          icon: <Image />,
          permissions: ["content.author", "content.manage"],
        },
      ],
    },
    {
      label: "AI Automation AI 运营",
      items: [
        {
          label: "AI 运营",
          path: "/admin/ai-ops",
          icon: <Bot />,
          permissions: ["ai.manage"],
        },
        {
          label: "AI 设置",
          path: "/admin/ai-settings",
          icon: <Settings2 />,
          permissions: ["ai.manage"],
        },
      ],
    },
    {
      label: "Site 站点管理",
      items: [
        {
          label: "成员与权限",
          path: "/admin/users",
          icon: <Users />,
          permissions: ["members.manage"],
        },
        {
          label: "站点设置",
          path: "/admin/settings",
          icon: <Settings />,
          permissions: ["site.manage"],
        },
      ],
    },
  ];

export function getFilteredAdminNavigation(
  hasPermission: (perm: string) => boolean,
): Array<{ label: string; items: AdminNavItem[] }> {
  return adminNavigation
    .map((group) => {
      const items = group.items.filter((item) => {
        if (!item.permissions || item.permissions.length === 0) return true;
        return item.permissions.some((p) => hasPermission(p));
      });
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);
}
