# Gouno UI 0.2.0 Blog import-surface audit

- Blog baseline: `a828e8ea2dac9ffb0c1ec03af86211897e7ca252`
- Canonical Gouno UI: `3af2a5ca7d63f30fa531f605e620ba2c3380a2e8` (`0.2.0`)
- Scope: exact root imports from `@gouno/ui` under `blog-frontend/src`.

## Summary

- Imported symbol families: **346**
- Canonical runtime symbols: **48**
- Legacy-only runtime symbols: **293**
- Canonical root-only runtime symbols: **0**
- Unknown type-only symbols: **5**

## Canonical runtime symbols

| Symbol | Owner | Value import files |
| --- | --- | --- |
| `Badge` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `BulkActionBar` | `patterns` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx` |
| `Button` | `core` | `blog-frontend/src/components/ErrorBoundary.tsx`<br>`blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/pages/ArticleIndex.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `ButtonLink` | `core` | `blog-frontend/src/App.tsx`<br>`blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/layouts/AdminShell.tsx`<br>`blog-frontend/src/pages/ArticleIndex.tsx`<br>`blog-frontend/src/pages/NotFound.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `Calendar` | `core` | `blog-frontend/src/components/agent/tools/StalePostsConfig.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx` |
| `Card` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `CardContent` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx` |
| `CardFooter` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx` |
| `CardHeader` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx` |
| `CardTitle` | `core` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `Checkbox` | `core` | `blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/components/agent/EmbeddingForm.tsx`<br>`blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/components/agent/ProviderForm.tsx`<br>`blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowMediaCandidates.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx` |
| `CheckboxField` | `core` | `blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx` |
| `ChoiceButton` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx` |
| `Drawer` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/layouts/PublicShell.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx` |
| `Field` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/components/agent/EmbeddingForm.tsx`<br>`blog-frontend/src/components/agent/ProviderForm.tsx`<br>`blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/agent/tools/DistributionDraftConfig.tsx`<br>`blog-frontend/src/components/agent/tools/KnowledgeSearchConfig.tsx`<br>`blog-frontend/src/components/agent/tools/LowEngagementConfig.tsx`<br>`blog-frontend/src/components/agent/tools/RssFetchConfig.tsx`<br>`blog-frontend/src/components/agent/tools/StalePostsConfig.tsx`<br>`blog-frontend/src/components/agent/tools/ToolBindingsEditor.tsx`<br>`blog-frontend/src/components/media/MediaDrawerForms.tsx`<br>`blog-frontend/src/components/taxonomy/CategoryForm.tsx`<br>`blog-frontend/src/pages/ArticleIndex.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `FormActions` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/components/agent/EmbeddingForm.tsx`<br>`blog-frontend/src/components/agent/ProviderForm.tsx`<br>`blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/media/MediaDrawerForms.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `FormGrid` | `core` | `blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/components/agent/EmbeddingForm.tsx`<br>`blog-frontend/src/components/agent/ProviderForm.tsx`<br>`blog-frontend/src/components/agent/SkillForm.tsx` |
| `FormLayout` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/components/agent/EmbeddingForm.tsx`<br>`blog-frontend/src/components/agent/ProviderForm.tsx`<br>`blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `IconButton` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/AgentRunRecords.tsx`<br>`blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/layouts/AdminShell.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `IconButtonLink` | `core` | `blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `Image` | `core` | `blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `Input` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/components/agent/EmbeddingForm.tsx`<br>`blog-frontend/src/components/agent/ProviderForm.tsx`<br>`blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowMediaCandidates.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/agent/tools/KnowledgeSearchConfig.tsx`<br>`blog-frontend/src/components/agent/tools/LowEngagementConfig.tsx`<br>`blog-frontend/src/components/agent/tools/RssFetchConfig.tsx`<br>`blog-frontend/src/components/agent/tools/StalePostsConfig.tsx`<br>`blog-frontend/src/components/media/MediaDrawerForms.tsx`<br>`blog-frontend/src/components/taxonomy/CategoryForm.tsx`<br>`blog-frontend/src/layouts/PublicShell.tsx`<br>`blog-frontend/src/pages/NotFound.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `List` | `core` | `blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx` |
| `Menu` | `core` | `blog-frontend/src/layouts/PublicShell.tsx` |
| `Modal` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowLauncher.tsx`<br>`blog-frontend/src/components/auth/StepUpMfaModal.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `NavigationGroup` | `gouno` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `navigationItemClass` | `gouno` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `NavigationProvider` | `core` | `blog-frontend/src/main.tsx` |
| `OverlayForm` | `core` | `blog-frontend/src/components/media/MediaDrawerForms.tsx`<br>`blog-frontend/src/components/taxonomy/CategoryForm.tsx` |
| `PageHeader` | `gouno` | `blog-frontend/src/App.tsx`<br>`blog-frontend/src/pages/AccountNotifications.tsx`<br>`blog-frontend/src/pages/Archive.tsx`<br>`blog-frontend/src/pages/Categories.tsx`<br>`blog-frontend/src/pages/CustomPageView.tsx`<br>`blog-frontend/src/pages/NotFound.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/Settings.tsx`<br>`blog-frontend/src/pages/Tags.tsx` |
| `Pagination` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/pages/ArticleIndex.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `SearchField` | `core` | `blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/layouts/AdminShell.tsx`<br>`blog-frontend/src/pages/ArticleIndex.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `Select` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/ProviderForm.tsx`<br>`blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowLauncher.tsx`<br>`blog-frontend/src/components/agent/WorkflowMediaCandidates.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/agent/tools/DistributionDraftConfig.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `Skeleton` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx` |
| `Tab` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `Table` | `core` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `TableBody` | `core` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `TableCell` | `core` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `TableHead` | `core` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `TableHeader` | `core` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `TableRow` | `core` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `TabList` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `TabPanel` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `Tabs` | `core` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `Textarea` | `core` | `blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowMediaCandidates.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/agent/tools/ToolBindingsEditor.tsx`<br>`blog-frontend/src/components/media/MediaDrawerForms.tsx`<br>`blog-frontend/src/components/taxonomy/CategoryForm.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `ThemeToggle` | `theme` | `blog-frontend/src/layouts/AdminShell.tsx`<br>`blog-frontend/src/layouts/PublicShell.tsx` |
| `TooltipProvider` | `core` | `blog-frontend/src/main.tsx` |
| `Upload` | `core` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |

## Legacy-only runtime symbols

| Symbol | Value import files |
| --- | --- |
| `} from "../../components/agent/AdvancedWorkspace";
import {
  AdminPage` | `blog-frontend/src/pages/admin/AISettings.tsx` |
| `} from "../../mfa";
import { Button` | `blog-frontend/src/components/auth/StepUpMfaModal.tsx` |
| `} from "../../mfa";
import { Toast` | `blog-frontend/src/components/auth/GlobalStepUpBoundary.tsx` |
| `} from "../../types/agent";
import {
  Button` | `blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `} from "../../types/agent";
import { AgentForm } from "./AgentForm";
import { SkillForm } from "./SkillForm";
import type { SkillFormValue } from "./SkillForm";
import { ProviderForm } from "./ProviderForm";
import type { ProviderFormValue } from "./ProviderForm";
import { EmbeddingForm } from "./EmbeddingForm";
import type { EmbeddingFormValue } from "./EmbeddingForm";
import { ConnectorWorkspace } from "./ConnectorWorkspace";
import { RiskPill` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx` |
| `} from "../../types/agent";
import { Button` | `blog-frontend/src/components/agent/WorkflowRunDetail.tsx`<br>`blog-frontend/src/components/agent/WorkspaceOverview.tsx` |
| `} from "../../types/agent";
import { connectorApi } from "../../api/connectors";
import {
  Button` | `blog-frontend/src/components/agent/ConnectorWorkspace.tsx` |
| `} from "../../types/agent";
import { emptyAgent } from "../../types/agent";
import { useFormDraft } from "../../hooks/useFormDraft";
import {
  Button` | `blog-frontend/src/components/agent/AgentForm.tsx` |
| `} from "../../types/agent";
import { operationsApi } from "../../api/operations";
import { BulkActionBar` | `blog-frontend/src/components/agent/OperationsWorkspace.tsx` |
| `} from "../../types/agent";
import { workflowApi } from "../../api/workflows";
import { ProposalPreview } from "./ProposalPreview";
import { StatusPill } from "./StatusPill";
import { OperationsWorkspace } from "./OperationsWorkspace";
import { JsonPreview } from "./AgentRunRecords";
import { Button` | `blog-frontend/src/components/agent/InboxWorkspace.tsx` |
| `} from "../../types/agent";
import { WorkspaceOverview } from "../../components/agent/WorkspaceOverview";
import type { ConsoleTab } from "../../components/agent/WorkspaceOverview";
import { InboxWorkspace } from "../../components/agent/InboxWorkspace";
import { RecordsWorkspace } from "../../components/agent/AgentRunRecords";
import { WorkflowWorkspace } from "../../components/agent/WorkflowWorkspace";
import { WorkflowRunRecords } from "../../components/agent/WorkflowRunRecords";
import {
  AdminPage` | `blog-frontend/src/pages/admin/AIOperations.tsx` |
| `} from "../../types/agent";
import type { SkillFormValue } from "../../components/agent/SkillForm";
import type { ProviderFormValue } from "../../components/agent/ProviderForm";
import type { EmbeddingFormValue } from "../../components/agent/EmbeddingForm";
import { AdvancedWorkspace } from "../../components/agent/AdvancedWorkspace";
import type {
  AdvancedSection` | `blog-frontend/src/pages/admin/AISettings.tsx` |
| `} from "../config/site-defaults";
import { pagesApi } from "../api/pages";
import { siteApi } from "../api/site";
import { extractMarkdownTOC } from "../utils/markdown";
import type { CustomPage` | `blog-frontend/src/pages/CustomPageView.tsx` |
| `} from "../config/site-defaults";
import { siteApi } from "../api/site";
import {
  adminNavigation` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `} from "../utils/navigation";
import { PAGINATION_LIMITS` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach` | `blog-frontend/src/pages/admin/__tests__/MediaLibrary.test.tsx` |
| `} from "lucide-react";
import { Link } from "react-router-dom";
import { analyticsApi } from "../../api/analytics";
import { notificationsApi } from "../../api/notifications";
import {
  AdminPage` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `} from "lucide-react";
import { mediaApi } from "../../api/media";
import { siteApi } from "../../api/site";
import { isMfaError } from "../../auth";
import { StepUpMfaModal } from "../../components/auth/StepUpMfaModal";
import { SudoGate } from "../../components/auth/SudoGate";
import {
  AdminPage` | `blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `} from "lucide-react";
import { mediaApi } from "../../api/media";
import type { MediaItem` | `blog-frontend/src/pages/admin/MediaLibrary.tsx` |
| `} from "lucide-react";
import { membersApi` | `blog-frontend/src/pages/admin/Users.tsx` |
| `} from "lucide-react";
import { Navigate } from "react-router-dom";
import { agentApi } from "../../api/agent";
import { operationsApi } from "../../api/operations";
import { workflowApi } from "../../api/workflows";
import type {
  Agent` | `blog-frontend/src/pages/admin/AIOperations.tsx` |
| `} from "lucide-react";
import { notificationsApi } from "../../api/notifications";
import type { Notification } from "../../api/notifications";
import {
  ActionGroup` | `blog-frontend/src/pages/admin/Notifications.tsx` |
| `} from "lucide-react";
import { useEffect` | `blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `} from "lucide-react";
import { useNavigate` | `blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx` |
| `} from "lucide-react";
import { useSession } from "@gosso/client/react";
import type { BlogUserProfile } from "../auth";
import { canPreviewUnpublished } from "../abilities";
import { analyticsApi } from "../api/analytics";
import { commentsApi } from "../api/comments";
import type { CommunityComment } from "../api/comments";
import { postsApi } from "../api/posts";
import {
  ActionGroup` | `blog-frontend/src/pages/PostDetail.tsx` |
| `} from "lucide-react";
import { useState } from "react";
import type {
  ContentCandidateSet` | `blog-frontend/src/components/agent/OperationsWorkspace.tsx` |
| `} from "lucide-react";
import type {
  Agent` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx` |
| `} from "lucide-react";
import type {
  AgentApproval` | `blog-frontend/src/components/agent/WorkspaceOverview.tsx` |
| `} from "lucide-react";
import type {
  ConnectorKind` | `blog-frontend/src/components/agent/ConnectorWorkspace.tsx` |
| `} from "react-router-dom";
import { I18nProvider` | `blog-frontend/src/App.tsx` |
| `} from "react-router-dom";
import { Search } from "lucide-react";
import {
  ArticleListSkeleton` | `blog-frontend/src/pages/ArticleIndex.tsx` |
| `AdminPage` | `blog-frontend/src/pages/admin/Notifications.tsx` |
| `AdminPageHeader` | `blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `AdminPageState` | `blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `AgentApproval` | `blog-frontend/src/pages/admin/AIOperations.tsx` |
| `AgentRun` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/AgentRunRecords.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx` |
| `AgentSkill` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx` |
| `AgentToolCall } from "../../types/agent";
import { RiskPill` | `blog-frontend/src/components/agent/AgentRunRecords.tsx` |
| `ArrowDown` | `blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `ArrowLeft` | `blog-frontend/src/components/agent/AgentRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunDetail.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `ArrowUp` | `blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `ArrowUpRight` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `ArticleListSkeleton` | `blog-frontend/src/pages/Home.tsx` |
| `AsyncState` | `blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx` |
| `Ban` | `blog-frontend/src/components/agent/WorkflowRunDetail.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx` |
| `Banner` | `blog-frontend/src/pages/PostDetail.tsx` |
| `BarChart3` | `blog-frontend/src/components/agent/tools/LowEngagementConfig.tsx` |
| `beforeEach } from "vitest";
import { fireEvent` | `blog-frontend/src/pages/admin/__tests__/PageEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PostEditor.test.tsx` |
| `beforeEach } from "vitest";
import { render` | `blog-frontend/src/pages/admin/__tests__/Pages.test.tsx` |
| `BookOpen` | `blog-frontend/src/pages/NotFound.tsx` |
| `Bot` | `blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx` |
| `BrowserRouter` | `blog-frontend/src/App.tsx` |
| `canManageBlog` | `blog-frontend/src/pages/__tests__/Pages.test.tsx` |
| `Check` | `blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx` |
| `CheckCheck` | `blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx` |
| `ChevronDown` | `blog-frontend/src/components/agent/OperationsWorkspace.tsx` |
| `ChevronRight` | `blog-frontend/src/components/agent/InboxWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx` |
| `CirclePause` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `classes` | `blog-frontend/src/components/editor/ContentEditorFrame.tsx` |
| `Code2` | `blog-frontend/src/components/agent/tools/ToolBindingsEditor.tsx` |
| `Component } from "react";
import type { ErrorInfo` | `blog-frontend/src/components/ErrorBoundary.tsx` |
| `ConfirmDialog` | `blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `ConnectorOutboxItem` | `blog-frontend/src/components/agent/ConnectorWorkspace.tsx` |
| `ConnectorProfile` | `blog-frontend/src/components/agent/ConnectorWorkspace.tsx` |
| `ContentCandidateSet` | `blog-frontend/src/components/agent/InboxWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkspaceOverview.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx` |
| `ContentPublishMode` | `blog-frontend/src/components/agent/SkillForm.tsx` |
| `ContentStack` | `blog-frontend/src/pages/AccountNotifications.tsx`<br>`blog-frontend/src/pages/Settings.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `Copy` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/media/MediaDrawerForms.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `Copy } from "lucide-react";
import { useI18n } from "../i18n";
import { markdownHeadingID } from "../utils/markdown";
import { Button` | `blog-frontend/src/components/MarkdownRenderer.tsx` |
| `copyText` | `blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `Crown` | `blog-frontend/src/pages/admin/Users.tsx` |
| `Database` | `blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `DatabaseZap` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/EmbeddingForm.tsx`<br>`blog-frontend/src/components/agent/tools/KnowledgeSearchConfig.tsx` |
| `DeleteTarget` | `blog-frontend/src/pages/admin/AISettings.tsx` |
| `describe` | `blog-frontend/src/layouts/__tests__/AdminShell.test.tsx`<br>`blog-frontend/src/pages/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Categories.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Comments.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/MediaLibrary.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Notifications.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PageEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PostEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Posts.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/SiteSettings.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Tags.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Users.test.tsx` |
| `Download` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx` |
| `Edit2` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `EditorialTask` | `blog-frontend/src/components/agent/InboxWorkspace.tsx`<br>`blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx` |
| `EditorPanel` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/components/agent/EmbeddingForm.tsx`<br>`blog-frontend/src/components/agent/ProviderForm.tsx`<br>`blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `EmbeddingProfile` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx` |
| `EmptyState` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/AgentRunRecords.tsx`<br>`blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/InboxWorkspace.tsx`<br>`blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunDetail.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/AccountNotifications.tsx`<br>`blog-frontend/src/pages/ArticleIndex.tsx`<br>`blog-frontend/src/pages/Home.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `ErrorState` | `blog-frontend/src/components/ErrorBoundary.tsx`<br>`blog-frontend/src/pages/AccountNotifications.tsx`<br>`blog-frontend/src/pages/ArticleIndex.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `ExecutionMode` | `blog-frontend/src/components/agent/SkillForm.tsx` |
| `expect` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/auth/__tests__/StepUpMfaModal.test.tsx`<br>`blog-frontend/src/layouts/__tests__/AdminShell.test.tsx`<br>`blog-frontend/src/pages/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Categories.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Comments.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/MediaLibrary.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Notifications.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PageEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PostEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Posts.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/SiteSettings.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Tags.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Users.test.tsx` |
| `ExternalLink` | `blog-frontend/src/layouts/AdminShell.tsx`<br>`blog-frontend/src/pages/Settings.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `Eye` | `blog-frontend/src/components/agent/AgentRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `Feedback` | `blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowLauncher.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/media/MediaDrawerForms.tsx`<br>`blog-frontend/src/layouts/AdminShell.tsx`<br>`blog-frontend/src/pages/Home.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/Settings.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `FileText` | `blog-frontend/src/pages/NotFound.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `Filter` | `blog-frontend/src/pages/admin/Notifications.tsx` |
| `FilterBar` | `blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `fireEvent` | `blog-frontend/src/layouts/__tests__/AdminShell.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Categories.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/MediaLibrary.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/SiteSettings.test.tsx` |
| `Flag` | `blog-frontend/src/pages/PostDetail.tsx` |
| `FolderTree` | `blog-frontend/src/pages/NotFound.tsx` |
| `FormInput` | `blog-frontend/src/components/agent/tools/ToolBindingsEditor.tsx` |
| `getBlogRoleLabel` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `getCachedSiteSettings` | `blog-frontend/src/layouts/AdminShell.tsx`<br>`blog-frontend/src/pages/CustomPageView.tsx` |
| `getFilteredAdminNavigation` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `getGossoAdminURL } from "../../auth";
import {
  openStepUpPopup` | `blog-frontend/src/components/auth/StepUpMfaModal.tsx` |
| `GitBranch` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkspaceOverview.tsx`<br>`blog-frontend/src/pages/Home.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx` |
| `Heart` | `blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx` |
| `History` | `blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx` |
| `Home` | `blog-frontend/src/components/ErrorBoundary.tsx`<br>`blog-frontend/src/pages/NotFound.tsx` |
| `ImagePlus` | `blog-frontend/src/components/media/MediaDrawerForms.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx` |
| `isLoggedIn } from "../../auth";
import { I18nProvider } from "../../i18n";
import { ToastProvider` | `blog-frontend/src/pages/__tests__/Pages.test.tsx` |
| `isMfaError` | `blog-frontend/src/components/auth/GlobalStepUpBoundary.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `isValidElement` | `blog-frontend/src/components/MarkdownRenderer.tsx` |
| `it` | `blog-frontend/src/components/auth/__tests__/StepUpMfaModal.test.tsx`<br>`blog-frontend/src/layouts/__tests__/AdminShell.test.tsx`<br>`blog-frontend/src/pages/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Categories.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Comments.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/MediaLibrary.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Notifications.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PageEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PostEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Posts.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/SiteSettings.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Tags.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Users.test.tsx` |
| `it } from "vitest";
import {
  AsyncState` | `blog-frontend/src/components/__tests__/ui.test.tsx` |
| `KeyRound` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/ProviderForm.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `Lightbulb` | `blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkspaceOverview.tsx` |
| `Link` | `blog-frontend/src/pages/PostDetail.tsx` |
| `Link } from "react-router-dom";
import { ArrowRight` | `blog-frontend/src/pages/Home.tsx` |
| `Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn` | `blog-frontend/src/components/reading/ArticleTeaser.tsx` |
| `Link2` | `blog-frontend/src/pages/admin/MediaLibrary.tsx` |
| `ListChecks` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/AgentRunRecords.tsx`<br>`blog-frontend/src/components/agent/SkillForm.tsx` |
| `ListRow` | `blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `ListStack` | `blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `LoaderCircle` | `blog-frontend/src/components/media/MediaDrawerForms.tsx` |
| `LoaderCircle } from "lucide-react";
import type { ArticleImagePreview } from "../../api/operations";
import type { MediaCandidate } from "../../types/agent";
import { Button` | `blog-frontend/src/components/agent/WorkflowMediaCandidates.tsx` |
| `LoadingState` | `blog-frontend/src/App.tsx`<br>`blog-frontend/src/pages/AccountNotifications.tsx`<br>`blog-frontend/src/pages/Archive.tsx`<br>`blog-frontend/src/pages/Categories.tsx`<br>`blog-frontend/src/pages/CustomPageView.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `Lock` | `blog-frontend/src/components/auth/SudoGate.tsx` |
| `LockKeyhole` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx` |
| `LogOut` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `logout } from "../auth";

import {
  DEFAULT_SITE_SETTINGS` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `Mail` | `blog-frontend/src/pages/CustomPageView.tsx`<br>`blog-frontend/src/pages/Home.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `MediaCandidate` | `blog-frontend/src/components/agent/InboxWorkspace.tsx`<br>`blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkspaceOverview.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx` |
| `MediaReference } from "../../api/media";
import { agentApi } from "../../api/agent";
import { useAbility } from "../../abilities";
import {
  AdminPage` | `blog-frontend/src/pages/admin/MediaLibrary.tsx` |
| `MembershipStatus } from "../constants";
import {
  AdminShell` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `MessageSquare` | `blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx` |
| `Navigate` | `blog-frontend/src/App.tsx` |
| `NavLink` | `blog-frontend/src/layouts/AdminShell.tsx`<br>`blog-frontend/src/layouts/PublicShell.tsx` |
| `notificationsApi } from "../api/notifications";
import { useUserProfile } from "@gosso/client/react";
import { type BlogUserProfile` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `OperationalSuggestion` | `blog-frontend/src/components/agent/InboxWorkspace.tsx`<br>`blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkspaceOverview.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx` |
| `Panel` | `blog-frontend/src/App.tsx`<br>`blog-frontend/src/components/ErrorBoundary.tsx`<br>`blog-frontend/src/components/agent/AgentRunRecords.tsx`<br>`blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/InboxWorkspace.tsx`<br>`blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkspaceOverview.tsx`<br>`blog-frontend/src/pages/AccountNotifications.tsx`<br>`blog-frontend/src/pages/Archive.tsx`<br>`blog-frontend/src/pages/Categories.tsx`<br>`blog-frontend/src/pages/CustomPageView.tsx`<br>`blog-frontend/src/pages/NotFound.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/Settings.tsx`<br>`blog-frontend/src/pages/Tags.tsx` |
| `PanelHeader` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/AgentRunRecords.tsx`<br>`blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunDetail.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `Pencil` | `blog-frontend/src/components/media/MediaDrawerForms.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx` |
| `Play` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowLauncher.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkspaceOverview.tsx` |
| `Plus` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/agent/tools/RssFetchConfig.tsx`<br>`blog-frontend/src/components/taxonomy/CategoryForm.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `ProviderProfile` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx` |
| `ProviderType } from "../../types/agent";
import { emptyProvider } from "../../types/agent";
import { useFormDraft } from "../../hooks/useFormDraft";
import {
  Button` | `blog-frontend/src/components/agent/ProviderForm.tsx` |
| `ReactNode } from "react";
import { AlertTriangle` | `blog-frontend/src/components/ErrorBoundary.tsx` |
| `ReactNode } from "react";
import { Link` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `RefreshCw` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `RefreshCw } from "lucide-react";
import i18n from "i18next";
import { ActionGroup` | `blog-frontend/src/components/ErrorBoundary.tsx` |
| `render` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/auth/__tests__/StepUpMfaModal.test.tsx`<br>`blog-frontend/src/layouts/__tests__/AdminShell.test.tsx`<br>`blog-frontend/src/pages/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Categories.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Comments.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/MediaLibrary.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Notifications.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PageEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PostEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Posts.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/SiteSettings.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Tags.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Users.test.tsx` |
| `Reply` | `blog-frontend/src/pages/PostDetail.tsx` |
| `riskLabel` | `blog-frontend/src/components/agent/StatusPill.tsx` |
| `RotateCcw` | `blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `Route` | `blog-frontend/src/App.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PageEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PostEditor.test.tsx` |
| `Routes` | `blog-frontend/src/App.tsx` |
| `Routes } from "react-router-dom";
import PageEditor from "../PageEditor";
import { ToastProvider` | `blog-frontend/src/pages/admin/__tests__/PageEditor.test.tsx` |
| `Routes } from "react-router-dom";
import PostEditor from "../PostEditor";
import { ToastProvider` | `blog-frontend/src/pages/admin/__tests__/PostEditor.test.tsx` |
| `Rss` | `blog-frontend/src/components/agent/tools/RssFetchConfig.tsx`<br>`blog-frontend/src/layouts/PublicShell.tsx`<br>`blog-frontend/src/pages/CustomPageView.tsx` |
| `Rss } from "lucide-react";
import {
  Button` | `blog-frontend/src/pages/Home.tsx` |
| `Save` | `blog-frontend/src/components/agent/AgentForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx` |
| `Save } from "lucide-react";
import { Button` | `blog-frontend/src/components/taxonomy/CategoryForm.tsx` |
| `Save } from "lucide-react";
import { useMemo` | `blog-frontend/src/components/agent/SkillForm.tsx` |
| `Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { EmbeddingProfile } from "../../types/agent";
import { useFormDraft } from "../../hooks/useFormDraft";
import {
  Button` | `blog-frontend/src/components/agent/EmbeddingForm.tsx` |
| `Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { ProviderProfile` | `blog-frontend/src/components/agent/ProviderForm.tsx` |
| `screen` | `blog-frontend/src/layouts/__tests__/AdminShell.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Categories.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/MediaLibrary.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Notifications.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PageEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PostEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Posts.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/SiteSettings.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Users.test.tsx` |
| `screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach` | `blog-frontend/src/pages/admin/__tests__/Tags.test.tsx` |
| `screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe` | `blog-frontend/src/components/auth/__tests__/StepUpMfaModal.test.tsx` |
| `screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach` | `blog-frontend/src/pages/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Comments.test.tsx` |
| `screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Plus } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe` | `blog-frontend/src/components/__tests__/ui.test.tsx` |
| `Search` | `blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `Search } from "lucide-react";
import { Button` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `Search } from "lucide-react";
import { IconButton` | `blog-frontend/src/layouts/PublicShell.tsx` |
| `Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { usePageTitle } from "../hooks/usePageTitle";
import { Button` | `blog-frontend/src/pages/NotFound.tsx` |
| `SectionHeading` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/Home.tsx` |
| `SectionNav` | `blog-frontend/src/components/__tests__/ui.test.tsx` |
| `Send` | `blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx` |
| `Share2` | `blog-frontend/src/components/agent/tools/DistributionDraftConfig.tsx` |
| `Shield } from "lucide-react";
import { getGossoAdminURL` | `blog-frontend/src/pages/Settings.tsx` |
| `ShieldAlert` | `blog-frontend/src/components/auth/SudoBanner.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx` |
| `ShieldAlert } from "lucide-react";
import { useParams } from "react-router-dom";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import {
  DEFAULT_SITE_SETTINGS` | `blog-frontend/src/pages/CustomPageView.tsx` |
| `ShieldCheck` | `blog-frontend/src/components/agent/InboxWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkspaceOverview.tsx`<br>`blog-frontend/src/components/auth/SudoBanner.tsx`<br>`blog-frontend/src/components/auth/SudoGate.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx` |
| `ShieldCheck } from "lucide-react";
import { stepUpMfa` | `blog-frontend/src/components/auth/StepUpMfaModal.tsx` |
| `ShieldOff` | `blog-frontend/src/components/agent/ConnectorWorkspace.tsx` |
| `SITE_SETTINGS_STORAGE_KEY` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `SITE_SETTINGS_UPDATED_EVENT` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `SiteSettings } from "../types/blog";
import { Banner` | `blog-frontend/src/pages/CustomPageView.tsx` |
| `Sliders } from "lucide-react";
import { useEffect` | `blog-frontend/src/components/agent/tools/ToolBindingsEditor.tsx` |
| `Sparkles` | `blog-frontend/src/components/agent/WorkspaceOverview.tsx`<br>`blog-frontend/src/components/agent/tools/RssFetchConfig.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx` |
| `Sparkles } from "lucide-react";
import {
  Button` | `blog-frontend/src/components/media/MediaDrawerForms.tsx` |
| `Sparkles } from "lucide-react";
import { Button` | `blog-frontend/src/components/agent/tools/DistributionDraftConfig.tsx`<br>`blog-frontend/src/components/agent/tools/KnowledgeSearchConfig.tsx`<br>`blog-frontend/src/components/agent/tools/LowEngagementConfig.tsx`<br>`blog-frontend/src/components/agent/tools/StalePostsConfig.tsx`<br>`blog-frontend/src/components/editor/AiSuggestionControl.tsx` |
| `Sparkles } from "lucide-react";
import { useEffect` | `blog-frontend/src/components/agent/WorkflowLauncher.tsx` |
| `Sparkles } from "lucide-react";
import { useMemo` | `blog-frontend/src/components/agent/AgentForm.tsx` |
| `Sparkles } from "lucide-react";
import { useSudoMode } from "../../hooks/useSudoMode";
import { Button` | `blog-frontend/src/components/auth/SudoBanner.tsx`<br>`blog-frontend/src/components/auth/SudoGate.tsx` |
| `StatusBadge` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `StatusIndicator` | `blog-frontend/src/components/agent/StatusPill.tsx` |
| `statusLabel } from "./labels";
import { RiskBadge` | `blog-frontend/src/components/agent/StatusPill.tsx` |
| `StatusPill } from "./StatusPill";
import { MarkdownRenderer } from "../MarkdownRenderer";
import {
  Button` | `blog-frontend/src/components/agent/AgentRunRecords.tsx` |
| `StatusPill } from "./StatusPill";
import { SudoGate } from "../auth/SudoGate";
import {
  Button` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx` |
| `STEP_UP_COMPLETED_EVENT` | `blog-frontend/src/components/auth/StepUpMfaModal.tsx` |
| `STEP_UP_MFA_QUERY_PARAM` | `blog-frontend/src/components/auth/GlobalStepUpBoundary.tsx` |
| `STEP_UP_MFA_REQUIRED_EVENT` | `blog-frontend/src/components/auth/GlobalStepUpBoundary.tsx` |
| `STEP_UP_POPUP_PARAM` | `blog-frontend/src/components/auth/StepUpMfaModal.tsx` |
| `StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Link } from "react-router-dom";
import { ThemeProvider` | `blog-frontend/src/main.tsx` |
| `SubnavTabs` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx` |
| `TableContainer` | `blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `TableSkeleton` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx` |
| `TestTube2` | `blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `ThumbsDown` | `blog-frontend/src/components/agent/OperationsWorkspace.tsx` |
| `ToastProvider` | `blog-frontend/src/App.tsx`<br>`blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx` |
| `ToolDefinition` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/SkillForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx` |
| `Trash2` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `Trash2 } from "lucide-react";
import { Button` | `blog-frontend/src/components/agent/tools/RssFetchConfig.tsx` |
| `Trash2 } from "lucide-react";
import { siteApi } from "../../api/site";
import { agentApi } from "../../api/agent";
import {
  AdminPage` | `blog-frontend/src/pages/admin/Categories.tsx` |
| `Trash2 } from "lucide-react";
import { siteApi } from "../../api/site";
import type { TagSummary } from "../../api/site";
import {
  AdminPage` | `blog-frontend/src/pages/admin/Tags.tsx` |
| `Trash2 } from "lucide-react";
import type { Agent` | `blog-frontend/src/components/agent/AgentRunRecords.tsx` |
| `Trash2 } from "lucide-react";
import type { ArticleImagePreview } from "../../api/operations";
import type {
  MediaCandidate` | `blog-frontend/src/components/agent/WorkflowRunDetail.tsx` |
| `TrendingUp` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `TriggerType` | `blog-frontend/src/components/agent/AgentForm.tsx` |
| `useCallback` | `blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/pages/AccountNotifications.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `useEffect` | `blog-frontend/src/components/agent/ConnectorWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/auth/GlobalStepUpBoundary.tsx`<br>`blog-frontend/src/layouts/AdminShell.tsx`<br>`blog-frontend/src/layouts/PublicShell.tsx`<br>`blog-frontend/src/pages/AccountNotifications.tsx`<br>`blog-frontend/src/pages/Archive.tsx`<br>`blog-frontend/src/pages/ArticleIndex.tsx`<br>`blog-frontend/src/pages/Categories.tsx`<br>`blog-frontend/src/pages/CustomPageView.tsx`<br>`blog-frontend/src/pages/Tags.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/Dashboard.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `useEffect } from "react";
import { ExternalLink` | `blog-frontend/src/components/auth/StepUpMfaModal.tsx` |
| `useI18n } from "./i18n";
import {
  Button` | `blog-frontend/src/App.tsx` |
| `useLocation` | `blog-frontend/src/App.tsx`<br>`blog-frontend/src/layouts/AdminShell.tsx`<br>`blog-frontend/src/pages/ArticleIndex.tsx` |
| `useLocation } from "react-router-dom";
import { beforeEach` | `blog-frontend/src/layouts/__tests__/AdminShell.test.tsx` |
| `useMemo` | `blog-frontend/src/components/MarkdownRenderer.tsx`<br>`blog-frontend/src/components/agent/WorkflowInputForm.tsx`<br>`blog-frontend/src/components/agent/WorkflowLauncher.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/agent/tools/ToolBindingsEditor.tsx`<br>`blog-frontend/src/layouts/PublicShell.tsx`<br>`blog-frontend/src/pages/Archive.tsx`<br>`blog-frontend/src/pages/CustomPageView.tsx`<br>`blog-frontend/src/pages/Tags.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx` |
| `useNavigate` | `blog-frontend/src/pages/ArticleIndex.tsx` |
| `useNavigate } from "react-router-dom";
import { Bell` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `useNavigate } from "react-router-dom";
import { LayoutDashboard` | `blog-frontend/src/layouts/PublicShell.tsx` |
| `useParams` | `blog-frontend/src/pages/ArticleIndex.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx` |
| `useParams } from "react-router-dom";
import {
  AdminPageState` | `blog-frontend/src/pages/admin/PageEditor.tsx` |
| `useParams } from "react-router-dom";
import { agentApi } from "../../api/agent";
import { postsApi } from "../../api/posts";
import { siteApi } from "../../api/site";
import { useAbility } from "../../abilities";
import {
  AdminPageState` | `blog-frontend/src/pages/admin/PostEditor.tsx` |
| `User` | `blog-frontend/src/pages/PostDetail.tsx` |
| `useRef` | `blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `useRef } from "react";
import {
  Bot` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx` |
| `useSafeUserProfile } from "../auth";
import {
  ButtonLink` | `blog-frontend/src/pages/Settings.tsx` |
| `useSearchParams` | `blog-frontend/src/pages/ArticleIndex.tsx` |
| `useSearchParams } from "react-router-dom";
import {
  ArrowLeft` | `blog-frontend/src/pages/PostDetail.tsx` |
| `useState` | `blog-frontend/src/pages/admin/AISettings.tsx` |
| `useState } from "react";
import {
  AlertTriangle` | `blog-frontend/src/pages/admin/Dashboard.tsx` |
| `useState } from "react";
import {
  ArrowLeft` | `blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx` |
| `useState } from "react";
import {
  Ban` | `blog-frontend/src/pages/admin/Users.tsx` |
| `useState } from "react";
import {
  Bell` | `blog-frontend/src/pages/admin/Notifications.tsx` |
| `useState } from "react";
import {
  Check` | `blog-frontend/src/components/agent/ConnectorWorkspace.tsx` |
| `useState } from "react";
import {
  Clock3` | `blog-frontend/src/pages/admin/AIOperations.tsx` |
| `useState } from "react";
import {
  FileText` | `blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `useState } from "react";
import {
  Link` | `blog-frontend/src/pages/ArticleIndex.tsx` |
| `useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState` | `blog-frontend/src/pages/Categories.tsx` |
| `useState } from "react";
import { Bell } from "lucide-react";
import { notificationsApi } from "../api/notifications";
import type { Notification } from "../api/notifications";
import {
  Button` | `blog-frontend/src/pages/AccountNotifications.tsx` |
| `useState } from "react";
import { Copy` | `blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx` |
| `useState } from "react";
import { Edit2` | `blog-frontend/src/pages/admin/Categories.tsx` |
| `useState } from "react";
import { GitBranch` | `blog-frontend/src/pages/CustomPageView.tsx` |
| `useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState` | `blog-frontend/src/pages/Archive.tsx`<br>`blog-frontend/src/pages/Tags.tsx` |
| `useState } from "react";
import { Merge` | `blog-frontend/src/pages/admin/Tags.tsx` |
| `useState } from "react";
import { operationsApi } from "../../api/operations";
import type { ArticleImagePreview } from "../../api/operations";
import { workflowApi } from "../../api/workflows";
import type {
  MediaCandidate` | `blog-frontend/src/components/agent/WorkflowRunRecords.tsx` |
| `useState } from "react";
import { Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { commentsApi } from "../../api/comments";
import {
  AdminPage` | `blog-frontend/src/pages/admin/Comments.tsx` |
| `useState } from "react";
import { workflowApi } from "../../api/workflows";
import type { ResourceOption } from "../../api/workflows";
import {
  Button` | `blog-frontend/src/components/agent/WorkflowInputForm.tsx` |
| `useState } from "react";
import { workflowApi } from "../../api/workflows";
import type { Workflow } from "../../types/agent";
import { Button` | `blog-frontend/src/components/agent/WorkflowLauncher.tsx` |
| `useState } from "react";
import type { FormEvent` | `blog-frontend/src/layouts/AdminShell.tsx` |
| `useState } from "react";
import type { FormEvent } from "react";
import {
  Copy` | `blog-frontend/src/pages/admin/MediaLibrary.tsx` |
| `useState } from "react";
import type { FormEvent } from "react";
import { workflowApi } from "../../api/workflows";
import { agentApi } from "../../api/agent";
import type {
  Agent` | `blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `useState } from "react";
import type { FormEvent } from "react";
import type {
  Agent` | `blog-frontend/src/components/agent/AgentForm.tsx` |
| `useState } from "react";
import type { FormEvent } from "react";
import type {
  AgentSkill` | `blog-frontend/src/components/agent/SkillForm.tsx` |
| `useState } from "react";
import type { ReactNode } from "react";
import {
  STEP_UP_COMPLETED_EVENT` | `blog-frontend/src/components/auth/GlobalStepUpBoundary.tsx` |
| `useState } from "react";
import type { ReactNode } from "react";
import { Link` | `blog-frontend/src/layouts/PublicShell.tsx` |
| `useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check` | `blog-frontend/src/components/MarkdownRenderer.tsx` |
| `useState } from "react";
import type { ToolDefinition } from "../../../types/agent";
import { Button` | `blog-frontend/src/components/agent/tools/ToolBindingsEditor.tsx` |
| `useToast` | `blog-frontend/src/components/__tests__/ui.test.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx`<br>`blog-frontend/src/pages/admin/AISettings.tsx`<br>`blog-frontend/src/pages/admin/Categories.tsx`<br>`blog-frontend/src/pages/admin/Comments.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx`<br>`blog-frontend/src/pages/admin/Notifications.tsx`<br>`blog-frontend/src/pages/admin/PageEditor.tsx`<br>`blog-frontend/src/pages/admin/Pages.tsx`<br>`blog-frontend/src/pages/admin/PostEditor.tsx`<br>`blog-frontend/src/pages/admin/Posts.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx`<br>`blog-frontend/src/pages/admin/Tags.tsx`<br>`blog-frontend/src/pages/admin/Users.tsx` |
| `vi` | `blog-frontend/src/pages/admin/__tests__/PageEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PostEditor.test.tsx` |
| `vi } from "vitest";
import { apiFetch` | `blog-frontend/src/pages/__tests__/Pages.test.tsx` |
| `vi } from "vitest";
import { apiFetch } from "../../../auth";
import { ToastProvider` | `blog-frontend/src/pages/admin/__tests__/Categories.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Comments.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Tags.test.tsx` |
| `vi } from "vitest";
import { StepUpMfaModal } from "../StepUpMfaModal";
import { ToastProvider` | `blog-frontend/src/components/auth/__tests__/StepUpMfaModal.test.tsx` |
| `vi } from "vitest";
import { ToastProvider` | `blog-frontend/src/pages/admin/__tests__/MediaLibrary.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Posts.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/SiteSettings.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Users.test.tsx` |
| `vi } from "vitest";
import AdminNotifications from "../Notifications";
import { apiFetch } from "../../../auth";
import { ToastProvider` | `blog-frontend/src/pages/admin/__tests__/Notifications.test.tsx` |
| `vi } from "vitest";
import AdminShell from "../AdminShell";
import AdminUsers from "../../pages/admin/Users";
import { ToastProvider` | `blog-frontend/src/layouts/__tests__/AdminShell.test.tsx` |
| `waitFor` | `blog-frontend/src/pages/admin/__tests__/MediaLibrary.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Pages.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Posts.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Users.test.tsx` |
| `waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { beforeEach` | `blog-frontend/src/pages/admin/__tests__/Notifications.test.tsx` |
| `waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter` | `blog-frontend/src/pages/admin/__tests__/PageEditor.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/PostEditor.test.tsx` |
| `waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach` | `blog-frontend/src/pages/admin/__tests__/SiteSettings.test.tsx` |
| `within` | `blog-frontend/src/pages/admin/__tests__/MediaLibrary.test.tsx` |
| `within } from "@testing-library/react";
import { MemoryRouter` | `blog-frontend/src/layouts/__tests__/AdminShell.test.tsx` |
| `within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach` | `blog-frontend/src/pages/admin/__tests__/Categories.test.tsx` |
| `within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach` | `blog-frontend/src/pages/admin/__tests__/Posts.test.tsx`<br>`blog-frontend/src/pages/admin/__tests__/Users.test.tsx` |
| `within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AdminPages from "../Pages";
import { ToastProvider` | `blog-frontend/src/pages/admin/__tests__/Pages.test.tsx` |
| `Workflow` | `blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkspaceOverview.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx` |
| `WorkflowInteractionTask` | `blog-frontend/src/components/agent/InboxWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunDetail.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx` |
| `WorkflowMetric` | `blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx` |
| `WorkflowResource` | `blog-frontend/src/components/agent/WorkflowRunDetail.tsx` |
| `WorkflowRun` | `blog-frontend/src/components/agent/WorkflowRunDetail.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/AIOperations.tsx` |
| `WorkflowRunEvent` | `blog-frontend/src/components/agent/WorkflowRunDetail.tsx` |
| `WorkflowStep` | `blog-frontend/src/components/agent/WorkflowWorkspace.tsx` |
| `WorkflowStepRun` | `blog-frontend/src/components/agent/WorkflowRunDetail.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx` |
| `WorkspacePanel` | `blog-frontend/src/components/agent/AdvancedWorkspace.tsx`<br>`blog-frontend/src/components/agent/AgentRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunDetail.tsx`<br>`blog-frontend/src/components/agent/WorkflowRunRecords.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/admin/SiteSettings.tsx` |
| `X` | `blog-frontend/src/components/agent/OperationsWorkspace.tsx`<br>`blog-frontend/src/components/agent/WorkflowWorkspace.tsx`<br>`blog-frontend/src/pages/PostDetail.tsx`<br>`blog-frontend/src/pages/admin/MediaLibrary.tsx` |
| `X } from "lucide-react";
import { useCallback` | `blog-frontend/src/components/agent/WorkflowRunRecords.tsx` |
| `X } from "lucide-react";
import { useEffect` | `blog-frontend/src/components/agent/WorkflowInputForm.tsx` |
| `X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  AdminPage` | `blog-frontend/src/pages/admin/Pages.tsx` |
| `X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { postsApi } from "../../api/posts";
import { siteApi } from "../../api/site";
import type { TagSummary } from "../../api/site";
import {
  AdminPage` | `blog-frontend/src/pages/admin/Posts.tsx` |
| `X } from "lucide-react";
import type {
  AgentApproval` | `blog-frontend/src/components/agent/InboxWorkspace.tsx` |

## Canonical root-only runtime symbols

| Symbol | Value import files |
| --- | --- |

## Unknown type-only symbols

| Symbol | Type import files |
| --- | --- |
| `ArticleImagePreview } from "../../api/operations";
import type { MediaCandidate } from "../../types/agent";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Button` | `blog-frontend/src/components/agent/ArticlePreviewModal.tsx` |
| `BlogMember } from "../../api/members";
import { getGossoAdminURL` | `blog-frontend/src/pages/admin/Users.tsx` |
| `BlogUserProfile } from "../../auth";
import { useUserProfile } from "@gosso/client/react";
import {
  AdminPage` | `blog-frontend/src/pages/admin/Users.tsx` |
| `ChangeEvent } from "react";
import { RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { agentApi } from "../../api/agent";
import type {
  Agent` | `blog-frontend/src/pages/admin/AISettings.tsx` |
| `ReactNode } from "react";
import { KeyRound` | `blog-frontend/src/components/auth/SudoGate.tsx` |

