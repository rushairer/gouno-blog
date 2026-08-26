import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { gossoAdminURL } from "../auth";

export default function HostedLoginRedirect() {
  const location = useLocation();

  useEffect(() => {
    const base = gossoAdminURL.replace(/\/$/, "");
    window.location.replace(`${base}/login${location.search}${location.hash}`);
  }, [location.hash, location.search]);

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
