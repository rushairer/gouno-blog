import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Eye,
  Flag,
  Heart,
  List,
  MessageSquare,
  RefreshCw,
  Reply,
  Send,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import { useSession } from "@gosso/client/react";
import type { BlogUserProfile } from "../auth";
import { canPreviewUnpublished } from "../abilities";
import { analyticsApi } from "../api/analytics";
import { commentsApi } from "../api/comments";
import type { CommunityComment } from "../api/comments";
import { postsApi } from "../api/posts";
import {
  ActionGroup,
  Badge,
  Banner,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Feedback,
  Field,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Panel,
  Textarea,
} from "@gouno/ui";
import { useI18n } from "../i18n";
import { useArticleSEO } from "../utils/seo";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { extractMarkdownTOC } from "../utils/markdown";
import { SESSION_KEYS } from "../constants";
import type { Post } from "../types/blog";
import NotFound from "./NotFound";

interface CommentItemProps {
  comment: CommunityComment;
  replies: CommunityComment[];
  onReply: (comment: CommunityComment) => void;
  onReport: (comment: CommunityComment) => void;
}

function CommentItem({
  comment,
  replies,
  onReply,
  onReport,
}: CommentItemProps) {
  const { t, formatDateTime } = useI18n();
  return (
    <div id={`comment-${comment.id}`} className="space-y-3">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <strong>{comment.author}</strong>
          <Badge>
            {comment.author_type === "user" ? t("signedIn") : t("guest")}
          </Badge>
          <span>{formatDateTime(comment.created_at)}</span>
        </div>
        <p className="mt-3 whitespace-pre-wrap leading-7">{comment.content}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!comment.parent_id ? (
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={() => onReply(comment)}
              icon={<Reply size={14} />}
            >
              {t("reply")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="compact"
            onClick={() => onReport(comment)}
            icon={<Flag size={14} />}
          >
            {t("report")}
          </Button>
        </div>
      </div>
      {replies.length > 0 ? (
        <div className="ml-4 space-y-3 border-l pl-4 sm:ml-8">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={[]}
              onReply={onReply}
              onReport={onReport}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function PostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const isPreviewParam = searchParams.get("preview") === "true";
  const { t, formatDate } = useI18n();
  const session = useSession<BlogUserProfile>();
  const canPreview = canPreviewUnpublished(session.profile);
  const [post, setPost] = useState<Post | null>(null);
  const [isAdminPreview, setIsAdminPreview] = useState(false);
  const [relatedPosts, setRelatedPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);
  const [reportingComment, setReportingComment] =
    useState<CommunityComment | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [interactionError, setInteractionError] = useState<string | null>(null);

  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [views, setViews] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;
      if (totalHeight > 0) {
        setScrollProgress(
          Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100)),
        );
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const fetchPostAndComments = useCallback(async () => {
    if (!slug) return;
    try {
      setLoading(true);
      setError(null);
      let postData: Post | null = null;
      let adminPreviewActive = false;

      const [postResult, communityResult, relatedResult] =
        await Promise.allSettled([
          postsApi.getPost(slug),
          postsApi.getCommunityState(slug),
          postsApi.getRelatedPosts(slug),
        ]);

      if (postResult.status === "fulfilled") {
        postData = postResult.value;
      } else if (isPreviewParam || canPreview) {
        try {
          postData = await postsApi.getAdminPost(slug);
          adminPreviewActive = true;
        } catch {
          try {
            let adminID: string | number = slug;
            if (!/^\d+$/.test(slug || "")) {
              const listData = await postsApi
                .getPosts({ q: slug || "", search: slug || "" }, true)
                .catch(() => null);
              const found = listData?.list?.find(
                (item: Post) => item.slug === slug,
              );
              if (found) adminID = found.id;
            }
            if (/^\d+$/.test(String(adminID))) {
              postData = await postsApi.getAdminPost(adminID);
              adminPreviewActive = true;
            }
          } catch (adminErr) {
            console.error("Admin preview fetch error:", adminErr);
          }
        }
      }

      if (!postData) {
        throw new Error(t("postNotFound"));
      }

      setPost(postData);
      setIsAdminPreview(
        adminPreviewActive ||
          (Boolean(postData.status && postData.status !== "published") &&
            canPreview),
      );

      const communityState =
        communityResult.status === "fulfilled" ? communityResult.value : null;
      setLikes(communityState?.likes_count ?? postData.likes_count ?? 0);
      setLiked(communityState?.liked || false);
      setRelatedPosts(
        relatedResult.status === "fulfilled" ? relatedResult.value : [],
      );
      const viewKey = `${SESSION_KEYS.POST_VIEWED_PREFIX}${postData.id}`;
      const alreadyViewed = sessionStorage.getItem(viewKey) === "1";
      setViews((postData.views_count || 0) + (alreadyViewed ? 0 : 1));

      if (!alreadyViewed && postData.status === "published") {
        sessionStorage.setItem(viewKey, "1");
        analyticsApi.recordView(postData.id).catch((e) => console.error(e));
      }

      try {
        const postComments = await commentsApi.getPostComments(postData.id);
        setComments(postComments || []);
      } catch {
        setComments([]);
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : t("failedFetch"));
    } finally {
      setLoading(false);
    }
  }, [slug, isPreviewParam, canPreview, t]);

  useEffect(() => {
    fetchPostAndComments();
  }, [fetchPostAndComments]);

  const articleSEO = useMemo(
    () =>
      post
        ? {
            title: post.title,
            description: post.summary,
            slug: post.slug,
            publishedAt: post.created_at,
            tags: post.tags,
          }
        : null,
    [post],
  );
  useArticleSEO(articleSEO);

  const handleLike = async () => {
    if (!post) return;
    const nextLiked = !liked;
    setInteractionError(null);
    try {
      const state = await commentsApi.setLike(post.id, nextLiked);
      setLiked(state.liked);
      setLikes(state.likes_count);
    } catch (err: unknown) {
      console.error(err);
      setInteractionError(
        err instanceof Error ? err.message : t("failedFetch"),
      );
    }
  };

  const handleAddComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !post ||
      (!session.loggedIn && !commentAuthor.trim()) ||
      !commentContent.trim()
    )
      return;

    setCommentLoading(true);
    setInteractionError(null);
    try {
      const created = await commentsApi.postComment(post.id, {
        author: commentAuthor,
        content: commentContent,
        parent_id: replyingTo?.id,
      });
      setCommentContent("");
      setCommentAuthor("");
      setReplyingTo(null);
      if (created.is_visible) {
        setComments((current) => [...current, created]);
        setCommentNotice(null);
      } else {
        setCommentNotice(t("commentPendingReview"));
      }
    } catch (err: unknown) {
      setInteractionError(
        err instanceof Error ? err.message : t("failedPostComment"),
      );
    } finally {
      setCommentLoading(false);
    }
  };

  const handleReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reportingComment) return;
    setInteractionError(null);
    try {
      const result = await commentsApi.reportComment(
        reportingComment.id,
        reportReason.trim(),
      );
      setCommentNotice(
        result === "already-reported"
          ? t("alreadyReported")
          : t("reportSubmitted"),
      );
      setReportingComment(null);
      setReportReason("");
    } catch (err: unknown) {
      setInteractionError(
        err instanceof Error ? err.message : t("failedFetch"),
      );
    }
  };

  if (loading) {
    return <LoadingState label={t("loadingArticle")} />;
  }

  if (error || !post) {
    const is404 =
      !post ||
      error === t("postNotFound") ||
      Boolean(error?.toLowerCase().includes("not found")) ||
      Boolean(error?.toLowerCase().includes("404"));
    if (is404) {
      return <NotFound />;
    }
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-3xl items-center justify-center">
        <ErrorState
          title={t("failedFetch")}
          description={error}
          action={
            <ActionGroup>
              <Button
                variant="primary"
                onClick={fetchPostAndComments}
                icon={<RefreshCw size={15} />}
              >
                {t("retry")}
              </Button>
              <ButtonLink to="/articles" icon={<ArrowLeft size={15} />}>
                {t("backToFeed")}
              </ButtonLink>
            </ActionGroup>
          }
        />
      </div>
    );
  }

  const toc = extractMarkdownTOC(post.content);
  const rootComments = comments.filter((comment) => !comment.parent_id);
  const repliesByParent = new Map<number, CommunityComment[]>();
  comments.forEach((comment) => {
    if (!comment.parent_id) return;
    const replies = repliesByParent.get(comment.parent_id) || [];
    replies.push(comment);
    repliesByParent.set(comment.parent_id, replies);
  });

  return (
    <>
      <div
        className="fixed inset-x-0 top-0 z-50 h-1 bg-primary transition-[width]"
        style={{ width: `${scrollProgress}%` }}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        {isAdminPreview ? (
          <Banner tone="brand" icon={<ShieldAlert size={16} />}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <strong>管理员预览模式</strong> ·
                当前正在预览未发布的文章（草稿/定时发布）。普通访客无法查看此页面。
              </span>
              {post?.id ? (
                <ButtonLink size="compact" to={`/admin/posts/${post.id}/edit`}>
                  返回编辑器
                </ButtonLink>
              ) : null}
            </div>
          </Banner>
        ) : null}
        <Link
          to="/articles"
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft size={16} />
          {t("backToFeed")}
        </Link>

        <div
          className={`grid min-w-0 gap-8 ${toc.length === 0 ? "mx-auto w-full max-w-4xl" : "lg:grid-cols-[minmax(0,1fr)_16rem]"}`}
        >
          <Panel as="article" className="gap-8 p-5 sm:p-8">
            <div className="flex flex-col gap-5 border-b pb-8">
              {post.cover_url ? (
                <img
                  className="max-h-[28rem] w-full rounded-lg border object-cover"
                  src={post.cover_url}
                  alt={post.cover_alt || post.title}
                />
              ) : null}
              <PageHeader title={post.title} description={post.summary} />
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={15} />
                  {formatDate(post.created_at, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <User size={15} />
                  {t("author")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Eye size={15} />
                  {views}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Heart size={15} />
                  {likes}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <Badge key={tag}>#{tag}</Badge>
                ))}
              </div>
            </div>

            <MarkdownRenderer content={post.content} />

            <div className="flex justify-center border-t pt-6">
              <Button
                variant="ghost"
                className={`like-button ${liked ? "liked" : ""}`}
                onClick={handleLike}
                aria-pressed={liked}
                icon={
                  <Heart size={20} fill={liked ? "currentColor" : "none"} />
                }
              >
                {likes} {t("likes")}
              </Button>
            </div>
          </Panel>

          {toc.length > 0 && (
            <aside className="order-first self-start lg:order-none lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:[scrollbar-gutter:stable]">
              <Panel className="gap-3 p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <List size={18} />
                  {t("tableOfContents")}
                </h2>
                <nav
                  className="flex flex-col gap-1"
                  aria-label={t("tableOfContents")}
                >
                  {toc.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-primary ${item.level > 2 ? "pl-5" : ""}`}
                    >
                      {item.text}
                    </a>
                  ))}
                </nav>
              </Panel>
            </aside>
          )}
        </div>

        {relatedPosts.length > 0 ? (
          <Panel className="gap-5">
            <h2 className="text-lg font-semibold">{t("relatedPosts")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {relatedPosts.map((item) => (
                <Link
                  key={item.id}
                  to={`/articles/${item.slug}`}
                  className="flex min-w-0 flex-col gap-2 rounded-lg border p-4 hover:border-primary hover:bg-accent/40"
                >
                  <strong>{item.title}</strong>
                  <span className="line-clamp-2 text-sm text-muted-foreground">
                    {item.summary}
                  </span>
                  <small className="text-xs text-muted-foreground">
                    {item.tags
                      .slice(0, 3)
                      .map((tag) => `#${tag}`)
                      .join(" ")}
                  </small>
                </Link>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel className="gap-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquare size={20} />
            {t("discussion", { count: comments.length })}
          </h2>

          {comments.length === 0 ? (
            <EmptyState label={t("noComments")} />
          ) : (
            <div className="space-y-4">
              {rootComments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  replies={repliesByParent.get(comment.id) || []}
                  onReply={setReplyingTo}
                  onReport={setReportingComment}
                />
              ))}
            </div>
          )}

          <form
            className="flex flex-col gap-4 border-t pt-6"
            onSubmit={handleAddComment}
          >
            <h3 className="font-semibold">{t("leaveComment")}</h3>
            {interactionError ? (
              <Feedback type="error">{interactionError}</Feedback>
            ) : null}
            {commentNotice && (
              <Feedback type="success">{commentNotice}</Feedback>
            )}
            {replyingTo ? (
              <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                <span>{t("replyingTo", { name: replyingTo.author })}</span>
                <IconButton
                  label={t("cancelReply")}
                  icon={<X size={16} />}
                  onClick={() => setReplyingTo(null)}
                />
              </div>
            ) : null}
            {session.loggedIn ? (
              <p className="text-sm text-muted-foreground">
                {t("signedInComment")}
              </p>
            ) : (
              <Field label={t("name")}>
                <Input
                  type="text"
                  placeholder={t("yourName")}
                  value={commentAuthor}
                  onChange={(event) => setCommentAuthor(event.target.value)}
                  disabled={commentLoading}
                  required
                />
              </Field>
            )}
            <Field label={t("comment")}>
              <Textarea
                placeholder={t("typeComment")}
                rows={4}
                value={commentContent}
                onChange={(event) => setCommentContent(event.target.value)}
                disabled={commentLoading}
                required
              />
            </Field>
            <Button
              variant="primary"
              type="submit"
              loading={commentLoading}
              icon={<Send />}
            >
              {commentLoading ? t("posting") : t("postComment")}
            </Button>
          </form>
        </Panel>
      </div>
      <Modal
        open={reportingComment !== null}
        title={t("report")}
        description={t("reportReason")}
        onClose={() => {
          setReportingComment(null);
          setReportReason("");
        }}
        footer={
          <>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setReportingComment(null);
                setReportReason("");
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="report-comment-form"
              icon={<Flag />}
            >
              {t("report")}
            </Button>
          </>
        }
      >
        <form
          id="report-comment-form"
          className="flex flex-col gap-4"
          onSubmit={handleReport}
        >
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t("reportReason")}
            <Textarea
              rows={4}
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              required
            />
          </label>
        </form>
      </Modal>
    </>
  );
}
