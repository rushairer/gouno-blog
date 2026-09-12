import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Copy,
  Crown,
  ExternalLink,
  KeyRound,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { membersApi, type BlogMember } from "../../api/members";
import { getGossoAdminURL, isMfaError, type BlogUserProfile } from "../../auth";
import { useUserProfile } from "@gosso/client/react";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Empty,
  FormField,
  IconButton,
  Input,
  Modal,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Text,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";

import { StepUpMfaModal } from "../../components/auth/StepUpMfaModal";
import { SudoGate } from "../../components/auth/SudoGate";
import { useAdminGuard } from "../../hooks/useAdminGuard";
import { useAppFeedback } from "../../components/feedback/AppFeedbackProvider";

const assignableRoles = ["admin", "editor", "author", "moderator"] as const;
const assignableRoleSet = new Set<string>(assignableRoles);
const roleLabels: Record<string, string> = {
  owner: "所有者",
  admin: "管理员",
  editor: "编辑",
  author: "作者",
  moderator: "审核员",
};

const roleDescriptions: Record<string, string> = {
  admin: "管理后台成员、站点设置及全站内容",
  editor: "创建、编辑、审核与发布全站内容",
  author: "撰写、发布与管理本人创建的内容",
  moderator: "审核与管理读者评论、互动和举报",
};

function memberName(member: BlogMember) {
  if (member.principal.display_name?.trim()) {
    return member.principal.display_name.trim();
  }
  if (member.principal.email?.trim()) {
    return member.principal.email.trim();
  }
  if (member.principal.subject?.trim()) {
    return `用户 ${member.principal.subject.slice(0, 8)}`;
  }
  return "未命名成员";
}

function initials(member: BlogMember) {
  return memberName(member).trim().slice(0, 2).toUpperCase();
}

function membershipLabel(status: BlogMember["membership_status"]) {
  if (status === "active") return "已启用";
  if (status === "suspended") return "已暂停";
  if (status === "removed") return "已移除";
  return "访客";
}

function MembershipTag({
  status,
}: {
  status: BlogMember["membership_status"];
}) {
  if (status === "active") {
    return <Tag color="success">{membershipLabel(status)}</Tag>;
  }
  if (status === "suspended" || status === "removed") {
    return <Tag color="error">{membershipLabel(status)}</Tag>;
  }
  return <Tag>{membershipLabel(status)}</Tag>;
}

function RoleTag({ role }: { role: string }) {
  if (role === "owner") return <Tag color="warning">{roleLabels[role]}</Tag>;
  if (role === "admin") return <Tag color="primary">{roleLabels[role]}</Tag>;
  return <Tag>{roleLabels[role] || role}</Tag>;
}

function editableRole(member: BlogMember) {
  if (member.roles.includes("owner")) return "owner";
  return member.roles.find((role) => assignableRoleSet.has(role)) || "author";
}

function MembersLoadingState() {
  return (
    <Card padding="base" aria-label="成员加载中">
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <Text size="sm" tone="muted">
          正在同步成员目录…
        </Text>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_9rem_8rem]"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
            </div>
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AdminUsers() {
  const allowed = useAdminGuard("/admin/users");
  const user = useUserProfile<BlogUserProfile>();
  const { notify } = useAppFeedback();
  const [members, setMembers] = useState<BlogMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [editing, setEditing] = useState<BlogMember | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    (() => Promise<void>) | null
  >(null);
  const [confirm, setConfirm] = useState<{
    member: BlogMember;
    action: "suspend" | "restore" | "transfer";
  } | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      setMembers((await membersApi.list()).members);
    } catch {
      setError("无法加载成员与权限，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateMember = async (
    member: BlogMember,
    status: string,
    roles: string[],
    displayName?: string,
  ) => {
    setSaving(member.principal.id);
    setError("");
    try {
      await membersApi.update(member.principal.id, status, roles, displayName);
      await load();
      notify("成员信息与权限已更新。");
    } catch (err) {
      if (isMfaError(err)) {
        setPendingAction(
          () => () => updateMember(member, status, roles, displayName),
        );
        setStepUpOpen(true);
      } else {
        setError(
          err instanceof Error ? err.message : "更新成员失败，请稍后重试。",
        );
      }
    } finally {
      setSaving(null);
    }
  };

  const saveRoles = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("display_name") ?? "").trim();
    const isOwner = editing.roles.includes("owner");
    const selectedRole = isOwner
      ? "owner"
      : String(form.get("role") || "author");
    await updateMember(editing, "active", [selectedRole], displayName);
    setEditing(null);
  };

  const executeConfirm = async () => {
    if (!confirm) return;
    const { member, action } = confirm;
    setSaving(member.principal.id);
    setError("");
    try {
      if (action === "transfer") {
        await membersApi.transferOwner(member.principal.id);
        notify("所有权已移交。");
      } else {
        await membersApi.update(
          member.principal.id,
          action === "suspend" ? "suspended" : "active",
          member.roles,
        );
        notify(action === "suspend" ? "成员已暂停。" : "成员已恢复。");
      }
      setConfirm(null);
      await load();
    } catch (err) {
      if (isMfaError(err)) {
        setPendingAction(() => () => executeConfirm());
        setStepUpOpen(true);
      } else {
        setError(
          err instanceof Error ? err.message : "操作未完成，请稍后重试。",
        );
      }
    } finally {
      setSaving(null);
    }
  };

  const copySubject = (member: BlogMember) => {
    void navigator.clipboard.writeText(member.principal.subject);
    notify(`已复制完整 Subject ID: ${member.principal.subject}`);
  };

  const renderActions = (member: BlogMember) => {
    const busy = saving === member.principal.id;
    const isOwner = member.roles.includes("owner");
    return (
      <>
        <IconButton
          variant="ghost"
          label={`编辑 ${memberName(member)} 成员与权限`}
          icon={<KeyRound />}
          disabled={busy}
          onClick={() => setEditing(member)}
        />
        {!isOwner ? (
          <IconButton
            variant="ghost"
            label={`移交所有权给 ${memberName(member)}`}
            icon={<Crown />}
            disabled={busy || member.membership_status !== "active"}
            onClick={() => setConfirm({ member, action: "transfer" })}
          />
        ) : null}
        {isOwner ? null : member.membership_status === "suspended" ? (
          <IconButton
            variant="ghost"
            label={`恢复 ${memberName(member)}`}
            icon={<RotateCcw />}
            disabled={busy}
            onClick={() => setConfirm({ member, action: "restore" })}
          />
        ) : (
          <IconButton
            variant="ghost"
            color="error"
            label={`暂停 ${memberName(member)}`}
            icon={<Ban />}
            disabled={busy}
            onClick={() => setConfirm({ member, action: "suspend" })}
          />
        )}
      </>
    );
  };

  const targetAdminURL =
    getGossoAdminURL(user) ||
    members.find((member) => member.principal?.issuer)?.principal?.issuer ||
    "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="成员与权限"
        description="管理 Blog 后台成员与角色分配；身份认证与账号安全由 GOSSO 提供。"
        actions={
          <>
            <Button
              size="small"
              type="button"
              onClick={() => void load()}
              loading={loading}
              icon={<RefreshCw />}
            >
              刷新
            </Button>
            {targetAdminURL ? (
              <ButtonLink
                size="small"
                to={targetAdminURL}
                target="_blank"
                rel="noreferrer"
                icon={<ExternalLink />}
              >
                前往 GOSSO 管理
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {error ? (
        <Alert
          type="error"
          showIcon
          title="成员目录操作失败"
          description={error}
          action={
            <Button size="small" type="button" onClick={() => void load()}>
              重新载入
            </Button>
          }
        />
      ) : null}

      {loading ? (
        <MembersLoadingState />
      ) : members.length === 0 ? (
        <Card padding="lg">
          <Empty
            title="暂未同步到任何登录用户"
            description="成员目录会在用户首次登录 Blog 后建立产品侧成员关系。"
            action={
              <Button size="small" type="button" onClick={() => void load()}>
                重新加载
              </Button>
            }
          />
        </Card>
      ) : (
        <SudoGate
          title="成员与权限安全保护"
          description="修改 Blog 成员角色、移交所有权或暂停成员资格需要近期多因素身份认证。解锁后享有 10 分钟无打扰操作期。"
          actionLabel="解锁以管理成员权限"
          unlockedPresentation="alert"
        >
          <div className="hidden md:block">
            <Table density="compact" bordered>
              <TableHeader>
                <TableRow>
                  <TableHead>成员</TableHead>
                  <TableHead className="w-32">账号 ID</TableHead>
                  <TableHead className="w-48">Blog 角色</TableHead>
                  <TableHead className="w-28">状态</TableHead>
                  <TableHead className="w-36 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.principal.id}>
                    <TableCell className="min-w-64 whitespace-normal">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                          aria-hidden="true"
                        >
                          {initials(member)}
                        </span>
                        <div className="min-w-0">
                          <strong className="text-sm font-semibold text-foreground">
                            {memberName(member)}
                          </strong>
                          {member.principal.email ? (
                            <div className="break-all font-mono text-xs text-muted-foreground">
                              {member.principal.email}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="small"
                        className="font-mono text-xs"
                        title={`点击复制完整 Subject ID: ${member.principal.subject}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          copySubject(member);
                        }}
                        icon={<Copy size={13} />}
                      >
                        {member.principal.subject.slice(0, 8)}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {member.roles.length ? (
                          member.roles.map((role) => (
                            <RoleTag key={role} role={role} />
                          ))
                        ) : (
                          <span className="text-xs italic text-muted-foreground">
                            尚未授予角色
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <MembershipTag status={member.membership_status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-max items-center justify-end gap-1">
                        {renderActions(member)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div
            className="grid gap-3 md:hidden"
            role="list"
            aria-label="成员列表"
          >
            {members.map((member) => (
              <Card key={member.principal.id} padding="base" role="listitem">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                      aria-hidden="true"
                    >
                      {initials(member)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="min-w-0 break-words text-sm font-semibold leading-snug">
                          {memberName(member)}
                        </strong>
                        <MembershipTag status={member.membership_status} />
                      </div>
                      {member.principal.email ? (
                        <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                          {member.principal.email}
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {member.roles.length ? (
                          member.roles.map((role) => (
                            <RoleTag key={role} role={role} />
                          ))
                        ) : (
                          <span className="text-xs italic text-muted-foreground">
                            尚未授予角色
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="small"
                          className="font-mono text-xs"
                          title={`点击复制完整 Subject ID: ${member.principal.subject}`}
                          onClick={() => copySubject(member)}
                          icon={<Copy size={13} />}
                        >
                          {member.principal.subject.slice(0, 8)}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-max items-center justify-end gap-1">
                    {renderActions(member)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </SudoGate>
      )}

      <Modal
        open={Boolean(editing)}
        title={
          editing ? `编辑 ${memberName(editing)} 的成员信息与权限` : "编辑成员"
        }
        description="Blog 角色决定产品内的内容和运营权限；账号密码与 MFA 仍由 GOSSO 管理。"
        onClose={() => setEditing(null)}
        footer={
          editing ? (
            <>
              <Button
                variant="outline"
                type="button"
                onClick={() => setEditing(null)}
              >
                取消
              </Button>
              <Button
                variant="solid"
                color="primary"
                type="submit"
                form="member-role-form"
                loading={saving === editing.principal.id}
              >
                保存设置
              </Button>
            </>
          ) : null
        }
      >
        {editing ? (
          <form
            id="member-role-form"
            className="flex flex-col gap-5"
            onSubmit={(event) => void saveRoles(event)}
          >
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                aria-hidden="true"
              >
                {initials(editing)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{memberName(editing)}</strong>
                  {editing.roles.includes("owner") ? (
                    <Tag color="warning">所有者</Tag>
                  ) : null}
                </div>
                <Text size="xs" tone="muted" className="break-all">
                  {editing.principal.email || "GOSSO 已验证身份"}
                </Text>
              </div>
            </div>

            <FormField
              label="成员显示昵称 / 备注名"
              hint="用于在文章作者署名、操作审计日志及后台成员目录中展示。"
            >
              <Input
                type="text"
                name="display_name"
                defaultValue={editing.principal.display_name}
                placeholder={
                  editing.principal.email || "设置在 Blog 内部展示的名称"
                }
                maxLength={64}
                autoComplete="off"
              />
            </FormField>

            <FormField
              label="Blog 角色分配（单选）"
              hint={
                editing.roles.includes("owner")
                  ? "当前所有者角色只能通过所有权移交流程变更。"
                  : "每次只保留一个主角色。"
              }
            >
              <Select
                aria-label="Blog 角色"
                name="role"
                defaultValue={editableRole(editing)}
                disabled={editing.roles.includes("owner")}
              >
                {editing.roles.includes("owner") ? (
                  <option value="owner">所有者</option>
                ) : null}
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </Select>
            </FormField>

            <Text size="xs" tone="muted" className="leading-relaxed">
              {editing.roles.includes("owner")
                ? "拥有 Blog 最高管理权限；所有权仅可通过“移交所有权”操作转让。"
                : roleDescriptions[editableRole(editing)]}
            </Text>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(confirm)}
        title={
          confirm?.action === "transfer"
            ? "移交 Blog 所有权"
            : confirm?.action === "suspend"
              ? "暂停成员"
              : "恢复成员"
        }
        description={
          confirm?.action === "transfer"
            ? `确认将 Blog 的所有权移交给“${confirm && memberName(confirm.member)}”？当前所有者将保留管理员角色。`
            : confirm?.action === "suspend"
              ? `暂停“${confirm && memberName(confirm.member)}”后，其后台访问权限将立即失效。`
              : `确认恢复“${confirm && memberName(confirm.member)}”的成员资格？`
        }
        onClose={() => setConfirm(null)}
        onOk={() => void executeConfirm()}
        okText={
          confirm?.action === "transfer"
            ? "确认移交"
            : confirm?.action === "suspend"
              ? "确认暂停"
              : "确认恢复"
        }
        cancelText="取消"
        okButtonProps={
          confirm?.action === "suspend"
            ? { variant: "solid", color: "error", loading: saving !== null }
            : { loading: saving !== null }
        }
      >
        <Alert
          type="warning"
          showIcon
          title="这是高权限操作"
          description="操作仍会经过 Sudo/MFA 最近验证，并由后端再次校验当前操作者权限。"
        />
      </Modal>

      <StepUpMfaModal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setPendingAction(null);
        }}
        onSuccess={async () => {
          if (pendingAction) {
            const action = pendingAction;
            setPendingAction(null);
            await action();
          }
        }}
      />
    </div>
  );
}
