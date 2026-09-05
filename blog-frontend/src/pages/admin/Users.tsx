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
  AdminPage,
  AdminPageHeader,
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  ContentStack,
  EmptyState,
  Feedback,
  IconButton,
  LoadingState,
  Modal,
  TableContainer,
  useToast,
} from "../../components/ui";
import { StepUpMfaModal } from "../../components/auth/StepUpMfaModal";
import { SudoGate } from "../../components/auth/SudoGate";
import { useAdminGuard } from "../../hooks/useAdminGuard";

const assignableRoles = ["admin", "editor", "author", "moderator"] as const;
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

function membershipTone(status: BlogMember["membership_status"]) {
  if (status === "active") return "success" as const;
  if (status === "suspended" || status === "removed") return "danger" as const;
  return "neutral" as const;
}

export default function AdminUsers() {
  const allowed = useAdminGuard("/admin/users");
  const user = useUserProfile<BlogUserProfile>();
  const { notify } = useToast();
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

  return (
    <AdminPage>
      <AdminPageHeader
        title="成员与权限"
        description="管理 Blog 后台成员与角色分配；身份认证与账号安全由 GOSSO 提供。"
        actions={
          <>
            <Button
              size="compact"
              type="button"
              onClick={() => void load()}
              loading={loading}
              icon={<RefreshCw />}
            >
              刷新
            </Button>
            {(() => {
              const targetAdminURL =
                getGossoAdminURL(user) ||
                members.find((m) => m.principal?.issuer)?.principal?.issuer ||
                "";
              if (!targetAdminURL) return null;
              return (
                <ButtonLink
                  size="compact"
                  to={targetAdminURL}
                  target="_blank"
                  rel="noreferrer"
                  icon={<ExternalLink />}
                >
                  前往 GOSSO 管理
                </ButtonLink>
              );
            })()}
          </>
        }
      />
      <ContentStack>
        {error ? <Feedback type="error">{error}</Feedback> : null}
        {loading ? (
          <LoadingState label="正在同步成员目录…" />
        ) : members.length === 0 ? (
          <EmptyState
            label="暂未同步到任何登录用户。"
            action={
              <Button size="compact" type="button" onClick={() => void load()}>
                重新加载
              </Button>
            }
          />
        ) : (
          <SudoGate
            title="成员与权限安全保护"
            description="修改 Blog 成员角色、移交所有权或暂停成员资格需要近期多因素身份认证。解锁后享有 10 分钟无打扰操作期。"
            actionLabel="解锁以管理成员权限"
          >
            <Card className="border-border/80 bg-card shadow-xs overflow-hidden">
              <TableContainer>
                <table className="admin-table member-table">
                  <thead>
                    <tr>
                      <th>成员</th>
                      <th className="w-32">账号 ID</th>
                      <th className="w-48">Blog 角色</th>
                      <th className="w-28">状态</th>
                      <th className="w-36 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => {
                      const busy = saving === member.principal.id;
                      const isOwner = member.roles.includes("owner");
                      return (
                        <tr
                          key={member.principal.id}
                          className="hover:bg-muted/40 transition-colors"
                        >
                          <td>
                            <div className="flex items-center gap-3">
                              <span
                                className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 text-sm"
                                aria-hidden="true"
                              >
                                {initials(member)}
                              </span>
                              <div className="flex flex-col gap-0.5">
                                <strong className="font-semibold text-foreground text-sm">
                                  {memberName(member)}
                                </strong>
                                {member.principal.email ? (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {member.principal.email}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td>
                            <Button
                              variant="ghost"
                              size="compact"
                              className="member-id-copy font-mono text-xs"
                              title={`点击复制完整 Subject ID: ${member.principal.subject}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void navigator.clipboard.writeText(
                                  member.principal.subject,
                                );
                                notify(
                                  `已复制完整 Subject ID: ${member.principal.subject}`,
                                );
                              }}
                              icon={<Copy size={13} />}
                            >
                              {member.principal.subject.slice(0, 8)}
                            </Button>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {member.roles.length ? (
                                member.roles.map((role) => (
                                  <Badge
                                    key={role}
                                    tone={
                                      role === "owner" ? "brand" : "neutral"
                                    }
                                  >
                                    {roleLabels[role] || role}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground/60 text-xs italic">
                                  尚未授予角色
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <Badge
                              tone={membershipTone(member.membership_status)}
                              pill
                            >
                              {membershipLabel(member.membership_status)}
                            </Badge>
                          </td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <IconButton
                                label="编辑成员与权限"
                                icon={<KeyRound />}
                                disabled={busy}
                                onClick={() => setEditing(member)}
                              />
                              {!isOwner ? (
                                <IconButton
                                  label="移交所有权"
                                  icon={<Crown />}
                                  disabled={
                                    busy ||
                                    member.membership_status !== "active"
                                  }
                                  onClick={() =>
                                    setConfirm({ member, action: "transfer" })
                                  }
                                />
                              ) : null}
                              {isOwner ? null : member.membership_status ===
                                "suspended" ? (
                                <IconButton
                                  label="恢复成员"
                                  icon={<RotateCcw />}
                                  disabled={busy}
                                  onClick={() =>
                                    setConfirm({ member, action: "restore" })
                                  }
                                />
                              ) : (
                                <IconButton
                                  variant="danger"
                                  label="暂停成员"
                                  icon={<Ban />}
                                  disabled={busy}
                                  onClick={() =>
                                    setConfirm({ member, action: "suspend" })
                                  }
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableContainer>
            </Card>
          </SudoGate>
        )}
      </ContentStack>

      <Modal
        open={Boolean(editing)}
        title={editing ? "编辑成员信息与权限" : "管理权限"}
        onClose={() => setEditing(null)}
        footer={
          editing ? (
            <>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                取消
              </Button>
              <Button
                variant="primary"
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
            className="modal-form member-role-form"
            onSubmit={(event) => void saveRoles(event)}
          >
            <div className="member-modal-profile">
              <span className="member-avatar" aria-hidden="true">
                {initials(editing)}
              </span>
              <div className="member-modal-info">
                <div className="member-modal-name">
                  <strong>{memberName(editing)}</strong>
                  {editing.roles.includes("owner") ? (
                    <Badge tone="brand">所有者</Badge>
                  ) : null}
                </div>
                <span className="member-modal-meta">
                  {editing.principal.email || "GOSSO 已验证身份"}
                </span>
              </div>
            </div>

            <label className="member-field-group">
              <span className="member-field-label">成员显示昵称 / 备注名</span>
              <input
                type="text"
                name="display_name"
                defaultValue={editing.principal.display_name}
                placeholder={
                  editing.principal.email || "设置在 Blog 内部展示的名称"
                }
                maxLength={64}
                autoComplete="off"
              />
              <small className="member-field-hint">
                用于在文章作者署名、操作审计日志及后台成员目录中展示。
              </small>
            </label>

            <div className="member-role-section">
              <span className="member-field-label">Blog 角色分配（单选）</span>
              <div className="member-role-list">
                {editing.roles.includes("owner") ? (
                  <label className="member-role-card">
                    <input
                      type="radio"
                      name="role"
                      value="owner"
                      defaultChecked
                      disabled
                    />
                    <div className="member-role-card-content">
                      <div className="member-role-card-header">
                        <strong>所有者</strong>
                        <span className="member-role-badge">不可变更</span>
                      </div>
                      <p>
                        拥有 Blog
                        最高管理权限；所有权仅可通过“移交所有权”操作转让。
                      </p>
                    </div>
                  </label>
                ) : (
                  assignableRoles.map((role) => {
                    const isCurrent = editing.roles.includes(role);
                    return (
                      <label key={role} className="member-role-card">
                        <input
                          type="radio"
                          name="role"
                          value={role}
                          defaultChecked={isCurrent}
                        />
                        <div className="member-role-card-content">
                          <div className="member-role-card-header">
                            <strong>{roleLabels[role]}</strong>
                            {isCurrent ? (
                              <span className="member-role-badge current">
                                当前角色
                              </span>
                            ) : null}
                          </div>
                          <p>{roleDescriptions[role]}</p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.action === "transfer"
            ? "移交所有权"
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
        confirmLabel={
          confirm?.action === "transfer"
            ? "确认移交"
            : confirm?.action === "suspend"
              ? "确认暂停"
              : "确认恢复"
        }
        danger={confirm?.action !== "restore"}
        busy={saving !== null}
        onConfirm={executeConfirm}
        onClose={() => setConfirm(null)}
      />

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
    </AdminPage>
  );
}
