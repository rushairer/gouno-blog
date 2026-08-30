import { ExternalLink, Shield } from "lucide-react";
import { getGossoAdminURL, useSafeUserProfile } from "../auth";
import { ContentStack, Feedback, PageHeader, Panel } from "../components/ui";
import { useI18n } from "../i18n";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Settings() {
  const { t } = useI18n();
  const user = useSafeUserProfile();
  const adminURL = getGossoAdminURL(user);
  usePageTitle(t("accountSettings"));

  return (
    <div>
      <PageHeader title={t("accountSettings")} />

      <Panel>
        <ContentStack>
          <div className="section-stack">
            <h2 className="section-title">
              <Shield size={18} />
              账户安全由 GOSSO Admin 管理
            </h2>
            <p className="muted">
              Blog
              仅维护博客侧资料、成员关系和权限，不再直接提供密码、邮箱、MFA、Passkey
              或身份会话管理。需要修改登录安全设置时，请前往身份管理中心完成近期强认证。
            </p>
            {adminURL ? (
              <a className="btn btn-primary" href={adminURL} rel="noreferrer">
                打开 GOSSO Admin
                <ExternalLink size={16} />
              </a>
            ) : (
              <Feedback type="error">
                当前会话未提供身份管理中心地址，请联系管理员配置
                VITE_GOSSO_ADMIN_URL。
              </Feedback>
            )}
          </div>
        </ContentStack>
      </Panel>
    </div>
  );
}
