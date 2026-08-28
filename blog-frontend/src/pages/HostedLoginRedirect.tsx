import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { gossoClient } from "../auth";

export default function HostedLoginRedirect() {
  const [params] = useSearchParams();
  const returnTo = params.get("return_to") || "/admin";

  useEffect(() => {
    void gossoClient.redirectToAuthorize(returnTo);
  }, [returnTo]);

  return (
    <div className="public-container state-page" role="status">
      <div className="state-card">
        <span className="spinner" aria-hidden="true" />
        <h1>正在前往安全登录页</h1>
        <p>登录由 GOSSO 身份提供方统一处理…</p>
      </div>
    </div>
  );
}
