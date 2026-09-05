# UI migration and functional regression ledger

The JSON ledger is authoritative. Implementation and real browser verification are tracked independently. No production data or credentials belong in evidence.

| Surface | Routes / subview | Implementation | Verification |
| --- | --- | --- | --- |
| blog:App.tsx |  | not-started | not-run |
| blog:components/ErrorBoundary.tsx |  | not-started | not-run |
| blog:components/MarkdownRenderer.tsx |  | not-started | not-run |
| blog-admin:components/agent/AdvancedWorkspace.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/AgentForm.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/AgentRunRecords.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/ArticlePreviewModal.tsx | /admin/ai-ops | not-started | not-run |
| connector:components/agent/ConnectorWorkspace.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/EmbeddingForm.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/InboxWorkspace.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/OperationsWorkspace.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/ProposalPreview.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/ProviderForm.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/SkillForm.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/StatusPill.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowInputForm.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowLauncher.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowMediaCandidates.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowRunDetail.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowRunOutput.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowRunRecords.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkflowWorkspace.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/WorkspaceOverview.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/DistributionDraftConfig.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/KnowledgeSearchConfig.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/LowEngagementConfig.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/RssFetchConfig.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/StalePostsConfig.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:components/agent/tools/ToolBindingsEditor.tsx | /admin/ai-ops | not-started | not-run |
| blog:components/auth/GlobalStepUpBoundary.tsx |  | not-started | not-run |
| blog:components/auth/StepUpMfaModal.tsx |  | not-started | not-run |
| blog:components/auth/SudoBanner.tsx |  | not-started | not-run |
| blog:components/auth/SudoGate.tsx |  | not-started | not-run |
| blog-admin:components/editor/AiSuggestionControl.tsx |  | not-started | not-run |
| blog-admin:components/editor/ContentEditorFrame.tsx |  | not-started | not-run |
| blog-admin:components/media/MediaDrawerForms.tsx |  | not-started | not-run |
| blog-admin:components/taxonomy/CategoryForm.tsx |  | not-started | not-run |
| blog-admin:layouts/AdminShell.tsx |  | not-started | not-run |
| blog:layouts/PublicShell.tsx |  | not-started | not-run |
| blog:pages/About.tsx | /about | not-started | not-run |
| blog:pages/AccountNotifications.tsx | /account/notifications, /notifications | not-started | not-run |
| blog:pages/Archive.tsx | /archive | not-started | not-run |
| blog:pages/ArticleIndex.tsx | /articles, /search, /categories/:slug, /tags/:slug | not-started | not-run |
| blog:pages/Categories.tsx | /categories | not-started | not-run |
| blog:pages/CustomPageView.tsx | /:slug | not-started | not-run |
| blog:pages/Home.tsx | / | not-started | not-run |
| blog:pages/NotFound.tsx | * | not-started | not-run |
| blog:pages/PostDetail.tsx | /articles/:slug | not-started | not-run |
| blog:pages/Settings.tsx | /account/settings, /settings | not-started | not-run |
| blog:pages/Tags.tsx | /tags | not-started | not-run |
| blog-admin:pages/admin/AIOperations.tsx | /admin/ai-ops | not-started | not-run |
| blog-admin:pages/admin/Categories.tsx | /admin/categories | not-started | not-run |
| blog-admin:pages/admin/Comments.tsx | /admin/comments | not-started | not-run |
| blog-admin:pages/admin/Dashboard.tsx | /admin, /admin/dashboard | not-started | not-run |
| blog-admin:pages/admin/MediaLibrary.tsx | /admin/medialibrary | not-started | not-run |
| blog-admin:pages/admin/Notifications.tsx | /admin/notifications | not-started | not-run |
| blog-admin:pages/admin/PageEditor.tsx | /admin/pages/new, /admin/pages/:id/edit | not-started | not-run |
| blog-admin:pages/admin/Pages.tsx | /admin/pages | not-started | not-run |
| blog-admin:pages/admin/PostEditor.tsx | /admin/posts/new, /admin/posts/:id/edit | not-started | not-run |
| blog-admin:pages/admin/Posts.tsx | /admin/posts | not-started | not-run |
| blog-admin:pages/admin/SiteSettings.tsx | /admin/settings | not-started | not-run |
| blog-admin:pages/admin/Tags.tsx | /admin/tags | not-started | not-run |
| blog-admin:pages/admin/Users.tsx | /admin/users | not-started | not-run |
| gosso-admin:App.tsx |  | not-started | not-run |
| gosso-admin:components/ErrorBoundary.tsx |  | not-started | not-run |
| gosso-admin:components/auth/LoginPreview.tsx |  | not-started | not-run |
| gosso-admin:components/auth/LoginSurface.tsx |  | not-started | not-run |
| gosso-admin:components/auth/SudoContext.tsx |  | not-started | not-run |
| gosso-admin:components/layout/AdminLayout.tsx |  | not-started | not-run |
| gosso-admin:pages/AccountSettings.tsx | /account-settings, /account-settings/:tab | not-started | not-run |
| gosso-admin:pages/Callback.tsx | /callback | not-started | not-run |
| gosso-admin:pages/ForgotPassword.tsx | /forgot-password | not-started | not-run |
| gosso-admin:pages/Home.tsx | / | not-started | not-run |
| gosso-admin:pages/Login.tsx | /login | not-started | not-run |
| gosso-admin:pages/NotFound.tsx | * | not-started | not-run |
| gosso-admin:pages/ResetPassword.tsx | /reset-password | not-started | not-run |
| gosso-admin:pages/SystemManagement.tsx | /system-management, /system-management/:tab | not-started | not-run |
| gosso-admin:pages/account-settings/EmailChangeModal.tsx | /account-settings/profile | not-started | not-run |
| gosso-admin:pages/account-settings/MFAPanel.tsx | /account-settings/mfa | not-started | not-run |
| gosso-admin:pages/account-settings/PasskeysPanel.tsx | /account-settings/passkeys | not-started | not-run |
| gosso-admin:pages/account-settings/PasswordPanel.tsx | /account-settings/password | not-started | not-run |
| gosso-admin:pages/account-settings/ProfilePanel.tsx | /account-settings/profile | not-started | not-run |
| gosso-admin:pages/account-settings/SessionsPanel.tsx | /account-settings/sessions | not-started | not-run |
| gosso-admin:pages/system-management/AuditLogsTab.tsx | /system-management/audit-logs | not-started | not-run |
| gosso-admin:pages/system-management/ClientsTab.tsx | /system-management/clients | not-started | not-run |
| gosso-admin:pages/system-management/SiteSettingsTab.tsx | /system-management/site-settings | not-started | not-run |
| gosso-admin:pages/system-management/SystemStatusTab.tsx | /system-management/system | not-started | not-run |
| gosso-admin:pages/system-management/UsersTab.tsx | /system-management/users | not-started | not-run |
| gosso-admin:pages/system-management/audit/AuditLogDetailModal.tsx | /system-management/audit | not-started | not-run |
| gosso-admin:pages/system-management/clients/ClientEditorModal.tsx | /system-management/clients | not-started | not-run |
| gosso-admin:pages/system-management/clients/ClientSecretModal.tsx | /system-management/clients | not-started | not-run |
| gosso-admin:pages/system-management/users/AssignRolesModal.tsx | /system-management/users | not-started | not-run |
| gosso-admin:pages/system-management/users/CreateUserModal.tsx | /system-management/users | not-started | not-run |
| gosso-admin:pages/system-management/users/ResetPasswordModal.tsx | /system-management/users | not-started | not-run |
| gosso-admin:pages/system-management/users/UserConsentsModal.tsx | /system-management/users | not-started | not-run |
| blog-admin:site-settings-tabs:basic | /admin/settings / basic | not-started | not-run |
| blog-admin:site-settings-tabs:appearance | /admin/settings / appearance | not-started | not-run |
| blog-admin:site-settings-tabs:hero | /admin/settings / hero | not-started | not-run |
| blog-admin:site-settings-tabs:social | /admin/settings / social | not-started | not-run |
| blog-admin:site-settings-tabs:seo | /admin/settings / seo | not-started | not-run |
| blog-admin:ai-workspaces:overview | /admin/ai-ops / overview | not-started | not-run |
| blog-admin:ai-workspaces:inbox | /admin/ai-ops / inbox | not-started | not-run |
| blog-admin:ai-workspaces:automation | /admin/ai-ops / automation | not-started | not-run |
| blog-admin:ai-workspaces:records:agent | /admin/ai-ops / records:agent | not-started | not-run |
| blog-admin:ai-workspaces:records:workflow | /admin/ai-ops / records:workflow | not-started | not-run |
| blog-admin:ai-workspaces:advanced:agents | /admin/ai-ops / advanced:agents | not-started | not-run |
| blog-admin:ai-workspaces:advanced:skills | /admin/ai-ops / advanced:skills | not-started | not-run |
| blog-admin:ai-workspaces:advanced:tools | /admin/ai-ops / advanced:tools | not-started | not-run |
| blog-admin:ai-workspaces:advanced:knowledge | /admin/ai-ops / advanced:knowledge | not-started | not-run |
| blog-admin:ai-workspaces:advanced:providers | /admin/ai-ops / advanced:providers | not-started | not-run |
| blog-admin:ai-workspaces:advanced:connectors | /admin/ai-ops / advanced:connectors | not-started | not-run |
