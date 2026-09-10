import { ExternalLink, Shield } from "lucide-react";
import { getGossoAdminURL, useSafeUserProfile } from "../auth";
import { PageHeader } from "@gouno/ui/gouno";
import { ButtonLink, ContentStack, Feedback, Panel } from "@gouno/ui-legacy";
import { useI18n } from "../i18n";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Settings() {
  const { t } = useI18n();
  const user = useSafeUserProfile();
  const adminURL = getGossoAdminURL(user);
  usePageTitle(t("accountSettings"));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title={t("accountSettings")} />

      <Panel>
        <ContentStack>
          <div className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Shield size={18} />
              账户安全由 GOSSO Admin 管理
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Blog
              仅维护博客侧资料、成员关系和权限，不再直接提供密码、邮箱、MFA、Passkey
              或身份会话管理。需要修改登录安全设置时，请前往身份管理中心完成近期强认证。
            </p>
            {adminURL ? (
              <ButtonLink
                variant="primary"
                to={adminURL}
                rel="noreferrer"
                icon={<ExternalLink size={16} />}
                iconPosition="right"
              >
                打开 GOSSO Admin
              </ButtonLink>
            ) : (
              <Feedback type="error">
                当前会话未提供身份管理中心地址，请联系管理员配置
                VITE_GOSSO_ADMIN_URL。
              </Feedback>
            )}
          </div>
        </ContentStack>
      </Panel>
    </main>
  );
}
