import { useEffect, useState } from "react";
import { canManageBlog, isLoggedIn, redirectToAuthorize } from "../auth";

export function useAdminGuard(returnTo: string) {
  const [allowed] = useState(() => isLoggedIn() && canManageBlog());
  useEffect(() => {
    if (!allowed) redirectToAuthorize(returnTo);
  }, [allowed, returnTo]);
  return allowed;
}
