export const adminProfile = {
  sub: "browser-acceptance-admin",
  name: "Visual Reviewer",
  preferred_username: "visual-reviewer",
  role: "owner",
  scope: "openid profile email admin",
  membership_status: "active",
  roles: ["owner", "admin"],
  permissions: [
    "content.author",
    "content.manage",
    "community.moderate",
    "site.manage",
    "members.manage",
    "ai.manage",
  ],
  authorization_version: 1,
  principal: {
    id: 1,
    issuer: "http://127.0.0.1:4173",
    subject: "browser-acceptance-admin",
    display_name: "Visual Reviewer",
    email: "visual-reviewer@example.test",
  },
};

export const limitedProfile = {
  ...adminProfile,
  role: "author",
  roles: ["author"],
  permissions: ["content.author"],
};
