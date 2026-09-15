import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Eye,
  Flag,
  Heart,
  Reply,
  Send,
  ShieldAlert,
  User,
} from "lucide-react";
import { useSession } from "@gosso/client/react";
import type { BlogUserProfile } from "../auth";
import { canPreviewUnpublished } from "../abilities";
import { analyticsApi } from "../api/analytics";
import { commentsApi } from "../api/comments";
import type { CommunityComment } from "../api/comments";
import { postsApi } from "../api/posts";
import {
  Alert,
  Anchor,
  Button,
  ButtonLink,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Result,
  Skeleton,
  Tag,
  Textarea,
} from "@gouno/ui/core";
import { PageHeader } from "@gouno/ui/gouno";
import { useI18n } from "../i18n";
import { useArticleSEO } from "../utils/seo";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { ArticleTeaser } from "../components/reading/ArticleTeaser";
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

function ArticleDetailSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]"
    >
      <Card padding="none" className="overflow-hidden">
        <Skeleton className="aspect-[16/7] w-full rounded-none" />
        <div className="space-y-6 p-6 sm:p-8">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
          </div>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton
              key={index}
              className={`h-4 ${index % 2 === 0 ? "w-full" : "w-5/6"}`}
            />
          ))}
        </div>
      </Card>
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

function CommunityLoading() {
  return (
    <div role="status" aria-label="评论加载中" className="space-y-3">
      {Array.from({ length: 2 }, (_, index) => (
        <Card key={index} padding="sm" className="gap-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </Card>
      ))}
    </div>
  );
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
      <Card padding="sm" className="gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <strong className="text-sm text-foreground">{comment.author}</strong>
          <Tag>
            {comment.author_type === "user" ? t("signedIn") : t("guest")}
          </Tag>
          <span>{formatDateTime(comment.created_at)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
          {comment.content}
        </p>
        <div className="flex flex-wrap gap-1">
          {!comment.parent_id ? (
            <Button
              type="button"
              variant="text"
              size="small"
              onClick={() => onReply(comment)}
              icon={<Reply size={14} />}
            >
              {t("reply")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="text"
            color="warning"
            size="small"
            onClick={() => onReport(comment)}
            icon={<Flag size={14} />}
          >
            {t("report")}
          </Button>
        </div>
      </Card>
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
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);
  const [reportingComment, setReportingComment] =
    useState<CommunityComment | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
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
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const loadComments = useCallback(
    async (postID: number) => {
      setCommentsLoading(true);
      setCommentsError(null);
      try {
        const postComments = await commentsApi.getPostComments(postID);
        setComments(postComments || []);
      } catch (reason: unknown) {
        setCommentsError(
          reason instanceof Error ? reason.message : t("failedLoadComments"),
        );
      } finally {
        setCommentsLoading(false);
      }
    },
    [t],
  );

  const fetchPostAndComments = useCallback(async () => {
    if (!slug) return;
    try {
      setLoading(true);
      setError(null);
      setComments([]);
      setCommentsError(null);
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

      if (!postData) throw new Error(t("postNotFound"));

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

      void loadComments(postData.id);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : t("failedFetch"));
    } finally {
      setLoading(false);
    }
  }, [slug, isPreviewParam, canPreview, t, loadComments]);

  useEffect(() => {
    void fetchPostAndComments();
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
    if (!post || likeLoading) return;
    const nextLiked = !liked;
    setInteractionError(null);
    setLikeLoading(true);
    try {
      const state = await commentsApi.setLike(post.id, nextLiked);
      setLiked(state.liked);
      setLikes(state.likes_count);
    } catch (err: unknown) {
      console.error(err);
      setInteractionError(
        err instanceof Error ? err.message : t("failedFetch"),
      );
    } finally {
      setLikeLoading(false);
    }
  };

  const handleAddComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !post ||
      (!session.loggedIn && !commentAuthor.trim()) ||
      !commentContent.trim()
    ) {
      return;
    }

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

  const beginReport = (comment: CommunityComment) => {
    setReportingComment(comment);
    setReportReason("");
    setReportError(null);
  };

  const closeReport = () => {
    setReportingComment(null);
    setReportReason("");
    setReportError(null);
  };

  const handleReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reportingComment || reportLoading) return;
    setReportError(null);
    setReportLoading(true);
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
      closeReport();
    } catch (err: unknown) {
      setReportError(err instanceof Error ? err.message : t("failedFetch"));
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) {
    return <ArticleDetailSkeleton label={t("loadingArticle")} />;
  }

  if (error || !post) {
    const is404 =
      !post ||
      error === t("postNotFound") ||
      Boolean(error?.toLowerCase().includes("not found")) ||
      Boolean(error?.toLowerCase().includes("404"));
    if (is404) return <NotFound />;

    return (
      <Card padding="none" variant="subtle">
        <Result
          role="alert"
          status="error"
          headingLevel={1}
          title={t("failedFetch")}
          description={error}
          extra={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="solid"
                color="primary"
                onClick={() => void fetchPostAndComments()}
                icon={<RefreshCwIcon />}
              >
                {t("retry")}
              </Button>
              <ButtonLink
                variant="outline"
                to="/articles"
                icon={<ArrowLeft size={15} />}
              >
                {t("backToFeed")}
              </ButtonLink>
            </div>
          }
        />
      </Card>
    );
  }

  const toc = extractMarkdownTOC(post.content);
  const tocItems = toc.map((item) => ({
    key: item.id,
    title:
      item.level > 2 ? <span className="pl-3">{item.text}</span> : item.text,
  }));
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
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-50 h-1 bg-muted"
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>
      <div className="flex w-full flex-col gap-8">
        {isAdminPreview ? (
          <Alert
            type="warning"
            showIcon
            icon={<ShieldAlert size={16} />}
            title="管理员预览模式"
            description="当前正在预览未发布的文章（草稿/定时发布）。普通访客无法查看此页面。"
            action={
              post.id ? (
                <ButtonLink size="small" to={`/admin/posts/${post.id}/edit`}>
                  返回编辑器
                </ButtonLink>
              ) : null
            }
          />
        ) : null}

        <ButtonLink
          variant="text"
          to="/articles"
          className="w-fit px-0"
          icon={<ArrowLeft size={16} />}
        >
          {t("backToFeed")}
        </ButtonLink>

        <div
          className={`grid min-w-0 items-start gap-8 ${toc.length === 0 ? "mx-auto w-full max-w-4xl" : "lg:grid-cols-[minmax(0,1fr)_15rem]"}`}
        >
          <Card as="article" padding="none" className="overflow-hidden">
            {post.cover_url ? (
              <img
                className="aspect-[16/7] w-full border-b object-cover"
                src={post.cover_url}
                alt={post.cover_alt || post.title}
              />
            ) : null}
            <div className="space-y-8 p-6 sm:p-8">
              <PageHeader title={post.title} description={post.summary} />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-y py-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={15} aria-hidden="true" />
                  {formatDate(post.created_at, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <User size={15} aria-hidden="true" />
                  {t("author")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Eye size={15} aria-hidden="true" />
                  {views}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Heart size={15} aria-hidden="true" />
                  {likes}
                </span>
                <div className="flex flex-wrap gap-2 sm:ml-auto">
                  {post.tags.map((tag) => (
                    <Tag key={tag}>#{tag}</Tag>
                  ))}
                </div>
              </div>

              <MarkdownRenderer content={post.content} />
            </div>
          </Card>

          {tocItems.length > 0 ? (
            <aside className="order-first self-start lg:order-none lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2 lg:[scrollbar-gutter:stable]">
              <Card variant="subtle" padding="sm" className="gap-3">
                <div className="text-sm font-semibold">{t("tableOfContents")}</div>
                <Anchor aria-label={t("tableOfContents")} items={tocItems} />
              </Card>
            </aside>
          ) : null}
        </div>

        {relatedPosts.length > 0 ? (
          <section
            aria-labelledby="related-reading"
            className="mx-auto w-full max-w-[900px]"
          >
            <div className="border-b pb-3">
              <h2
                id="related-reading"
                className="text-xl font-semibold tracking-tight"
              >
                {t("relatedPosts")}
              </h2>
            </div>
            {relatedPosts.map((item) => (
              <ArticleTeaser key={item.id} post={item} compact />
            ))}
          </section>
        ) : null}

        <section
          aria-labelledby="article-community"
          className="mx-auto w-full max-w-[900px] space-y-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
            <div>
              <h2
                id="article-community"
                className="text-xl font-semibold tracking-tight"
              >
                {t("discussion", { count: comments.length })}
              </h2>
            </div>
            <Button
              variant={liked ? "solid" : "outline"}
              color={liked ? "primary" : "default"}
              icon={<Heart fill={liked ? "currentColor" : "none"} />}
              aria-pressed={liked}
              loading={likeLoading}
              onClick={() => void handleLike()}
            >
              {likes} {t("likes")}
            </Button>
          </div>

          {interactionError ? (
            <Alert
              type="error"
              role="alert"
              title={t("requestFailed")}
              description={interactionError}
              showIcon
            />
          ) : null}
          {commentNotice ? (
            <Alert
              type="success"
              role="status"
              description={commentNotice}
              showIcon
            />
          ) : null}

          {commentsLoading ? (
            <CommunityLoading />
          ) : commentsError ? (
            <Alert
              type="error"
              role="alert"
              title={t("failedLoadComments")}
              description={commentsError}
              action={
                <Button onClick={() => void loadComments(post.id)}>
                  {t("retry")}
                </Button>
              }
              showIcon
            />
          ) : rootComments.length === 0 ? (
            <Empty title={t("noComments")} />
          ) : (
            <div className="space-y-4" aria-label="评论列表">
              {rootComments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  replies={repliesByParent.get(comment.id) || []}
                  onReply={setReplyingTo}
                  onReport={beginReport}
                />
              ))}
            </div>
          )}

          <Card as="section" variant="subtle" aria-labelledby="comment-form-title">
            <div>
              <h3 id="comment-form-title" className="text-base font-semibold">
                {t("leaveComment")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {session.loggedIn ? t("signedInComment") : t("typeComment")}
              </p>
            </div>

            {replyingTo ? (
              <Alert
                type="info"
                title={t("replyingTo", { name: replyingTo.author })}
                action={
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => setReplyingTo(null)}
                  >
                    {t("cancelReply")}
                  </Button>
                }
                showIcon
              />
            ) : null}

            <form className="space-y-4" onSubmit={handleAddComment}>
              {!session.loggedIn ? (
                <Field label={t("name")} required>
                  <Input
                    type="text"
                    placeholder={t("yourName")}
                    value={commentAuthor}
                    onChange={(event) => setCommentAuthor(event.target.value)}
                    disabled={commentLoading}
                    required
                  />
                </Field>
              ) : null}
              <Field label={t("comment")} required>
                <Textarea
                  placeholder={t("typeComment")}
                  rows={5}
                  value={commentContent}
                  onChange={(event) => setCommentContent(event.target.value)}
                  disabled={commentLoading}
                  required
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  variant="solid"
                  color="primary"
                  type="submit"
                  loading={commentLoading}
                  icon={<Send />}
                >
                  {commentLoading ? t("posting") : t("postComment")}
                </Button>
              </div>
            </form>
          </Card>
        </section>
      </div>

      <Modal
        open={reportingComment !== null}
        title={t("report")}
        description={t("reportReason")}
        onClose={closeReport}
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeReport}>
              {t("cancel")}
            </Button>
            <Button
              variant="solid"
              color="primary"
              type="submit"
              form="report-comment-form"
              icon={<Flag />}
              loading={reportLoading}
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
          {reportError ? (
            <Alert
              type="error"
              role="alert"
              description={reportError}
              showIcon
            />
          ) : null}
          <Field label={t("reportReason")} required>
            <Textarea
              rows={4}
              value={reportReason}
              onChange={(event) => {
                setReportReason(event.target.value);
                if (reportError) setReportError(null);
              }}
              disabled={reportLoading}
              required
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}

function RefreshCwIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
