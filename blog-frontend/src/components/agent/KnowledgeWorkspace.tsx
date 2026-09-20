import { useState } from "react";
import {
  DatabaseZap,
  Edit2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Empty,
  Heading,
  IconButton,
  Input,
  Tag,
  Text,
} from "@gouno/ui/core";
import type {
  EmbeddingProfile,
  KnowledgeIndexedContent,
  KnowledgeIndexStatus,
  KnowledgeSearchResponse,
} from "../../types/agent";
import { SudoGate } from "../auth/SudoGate";
import { TabPanelFeedback, TabPanelLead } from "../patterns/TabPanelLead";
import type { DeleteTarget } from "./AdvancedWorkspace";

interface KnowledgeWorkspaceProps {
  locale: "en" | "zh";
  labels: Record<string, string>;
  embeddingProfiles: EmbeddingProfile[];
  indexStatus: KnowledgeIndexStatus;
  indexedContent: KnowledgeIndexedContent[];
  searchResult: KnowledgeSearchResponse | null;
  searching: boolean;
  testingConnections: string[];
  onRetryIndex: () => Promise<void>;
  onRebuildIndex: () => Promise<void>;
  onSearch: (query: string) => Promise<void>;
  onEditEmbedding: (embedding: EmbeddingProfile | "new" | null) => void;
  onTestConnection: (
    kind: "provider" | "embedding",
    id: number,
    name: string,
  ) => Promise<void>;
  onDeleteTarget: (target: DeleteTarget) => void;
  formatDateTime: (value: string) => string;
}

export function KnowledgeWorkspace({
  locale,
  labels,
  embeddingProfiles,
  indexStatus,
  indexedContent,
  searchResult,
  searching,
  testingConnections,
  onRetryIndex,
  onRebuildIndex,
  onSearch,
  onEditEmbedding,
  onTestConnection,
  onDeleteTarget,
  formatDateTime,
}: KnowledgeWorkspaceProps) {
  const [query, setQuery] = useState("");

  return (
    <div data-pattern="settings-composition" className="contents">
      <SudoGate
        title="知识库与向量模型保护"
        description="添加、编辑、删除 Embedding 配置或执行全量重建需要近期多因素身份认证。"
        actionLabel="解锁以管理知识库"
      >
        <div className="flex flex-col gap-5">
          <TabPanelLead
            description={
              locale === "zh"
                ? "仅索引已发布文章；这里同时展示索引内容、检索证据和 Embedding 配置。"
                : "Only published content is indexed. Inspect indexed content, retrieval evidence, and embedding configuration here."
            }
            actions={
              <>
                <Button
                  size="small"
                  variant="outline"
                  type="button"
                  onClick={() => void onRetryIndex()}
                  icon={<RefreshCw />}
                >
                  {locale === "zh" ? "重试失败任务" : "Retry failed"}
                </Button>
                <Button
                  size="small"
                  variant="outline"
                  type="button"
                  onClick={() => void onRebuildIndex()}
                  icon={<DatabaseZap />}
                >
                  {locale === "zh" ? "全量重建" : "Rebuild all"}
                </Button>
                <Button
                  size="small"
                  variant="solid"
                  color="primary"
                  type="button"
                  onClick={() => onEditEmbedding("new")}
                  icon={<Plus />}
                >
                  {locale === "zh"
                    ? "添加 Embedding 模型"
                    : "Add embedding profile"}
                </Button>
              </>
            }
          />

          <TabPanelFeedback>
            {indexStatus.failed > 0 ? (
              <Alert
                type="warning"
                showIcon
                title={
                  locale === "zh"
                    ? "知识索引存在失败任务"
                    : "Knowledge indexing has failed jobs"
                }
                description={
                  locale === "zh"
                    ? "优先重试失败项；只有索引结构变化或一致性异常时才执行全量重建。"
                    : "Retry failed jobs first; rebuild the full index only for schema or consistency problems."
                }
              />
            ) : null}
          </TabPanelFeedback>

          <section
            className="flex flex-col gap-3"
            aria-labelledby="knowledge-overview-title"
          >
            <div>
              <Heading id="knowledge-overview-title" level={2} variant="compact">
                {locale === "zh" ? "索引概览" : "Index overview"}
              </Heading>
              <Text size="sm" tone="muted">
                {locale === "zh"
                  ? "确认已发布内容是否进入知识索引，以及检索链路是否健康。"
                  : "Confirm published content is indexed and the retrieval path is healthy."}
              </Text>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Card padding="base">
                <Text size="xs" tone="muted">
                  {locale === "zh" ? "已索引文章" : "Indexed posts"}
                </Text>
                <Heading level={3}>{indexStatus.indexed_posts}</Heading>
              </Card>
              <Card padding="base">
                <Text size="xs" tone="muted">
                  {locale === "zh" ? "分段" : "Chunks"}
                </Text>
                <Heading level={3}>{indexStatus.chunks}</Heading>
              </Card>
              <Card padding="base">
                <Text size="xs" tone="muted">
                  {locale === "zh" ? "队列" : "Queued"}
                </Text>
                <Heading level={3}>{indexStatus.queued}</Heading>
              </Card>
              <Card padding="base">
                <Text size="xs" tone="muted">
                  {locale === "zh" ? "失败" : "Failed"}
                </Text>
                <Heading level={3}>{indexStatus.failed}</Heading>
              </Card>
              <Card padding="base">
                <Text size="xs" tone="muted">
                  {locale === "zh" ? "检索 P95 · 24h" : "Retrieval P95 · 24h"}
                </Text>
                <Heading level={3}>
                  {indexStatus.retrieval_p95_ms_24h == null
                    ? "—"
                    : `${Math.round(indexStatus.retrieval_p95_ms_24h)} ms`}
                </Heading>
              </Card>
            </div>
          </section>

          <section
            className="flex flex-col gap-3"
            aria-labelledby="knowledge-content-title"
          >
            <div>
              <Heading id="knowledge-content-title" level={2} variant="compact">
                {locale === "zh" ? "已索引内容" : "Indexed content"}
              </Heading>
              <Text size="sm" tone="muted">
                {locale === "zh"
                  ? "直接查看哪些已发布文章已经转换为知识切片，以及最近同步时间。"
                  : "See which published posts have been converted to knowledge chunks and when they were last synchronized."}
              </Text>
            </div>
            {indexedContent.length === 0 ? (
              <Card padding="base">
                <Empty
                  description={
                    locale === "zh"
                      ? "暂无可显示的已发布索引内容。"
                      : "No published indexed content to display."
                  }
                />
              </Card>
            ) : (
              <Card padding="none" className="overflow-hidden">
                <CardContent className="divide-y p-0">
                  {indexedContent.map((item) => (
                    <div
                      key={item.post_id}
                      className="grid gap-3 p-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{item.title}</strong>
                          <Tag
                            color={
                              item.status === "ready" ? "success" : "warning"
                            }
                          >
                            {item.status === "ready"
                              ? locale === "zh"
                                ? "已同步"
                                : "Synced"
                              : locale === "zh"
                                ? "待同步"
                                : "Pending"}
                          </Tag>
                        </div>
                        <Text size="xs" tone="muted" className="break-all">
                          /{item.slug}
                        </Text>
                      </div>
                      <Text size="sm">{item.chunks} Chunks</Text>
                      <Text size="xs" tone="muted">
                        {item.last_indexed_at
                          ? formatDateTime(item.last_indexed_at)
                          : locale === "zh"
                            ? "等待首次索引"
                            : "Awaiting first index"}
                      </Text>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>

          <section
            className="flex flex-col gap-3"
            aria-labelledby="knowledge-retrieval-title"
          >
            <div>
              <Heading
                id="knowledge-retrieval-title"
                level={2}
                variant="compact"
              >
                {locale === "zh" ? "检索验证" : "Retrieval test"}
              </Heading>
              <Text size="sm" tone="muted">
                {locale === "zh"
                  ? "真实调用 content.search_knowledge 同一检索服务，检查命中文章、证据片段、Citation 和混合检索分数。"
                  : "Use the same retrieval service as content.search_knowledge to inspect matched posts, evidence snippets, citations, and hybrid scores."}
              </Text>
            </div>
            <Card padding="base">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-label={
                      locale === "zh"
                        ? "知识库检索测试"
                        : "Knowledge retrieval test"
                    }
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={
                      locale === "zh"
                        ? "输入一个问题验证知识检索…"
                        : "Ask a question to test knowledge retrieval…"
                    }
                  />
                  <Button
                    variant="solid"
                    color="primary"
                    disabled={!query.trim() || searching}
                    onClick={() => void onSearch(query.trim())}
                  >
                    {searching
                      ? locale === "zh"
                        ? "检索中…"
                        : "Searching…"
                      : locale === "zh"
                        ? "测试检索"
                        : "Test retrieval"}
                  </Button>
                </div>

                {searchResult ? (
                  <>
                    <Text size="xs" tone="muted">
                      {locale === "zh"
                        ? `本次检索耗时 ${searchResult.latency_ms} ms · 返回 ${searchResult.results.length} 条证据。`
                        : `Retrieval took ${searchResult.latency_ms} ms and returned ${searchResult.results.length} evidence items.`}
                    </Text>
                    {searchResult.results.length === 0 ? (
                      <Empty
                        description={
                          locale === "zh"
                            ? "没有找到匹配的知识证据。"
                            : "No matching knowledge evidence found."
                        }
                      />
                    ) : (
                      <div className="divide-y">
                        {searchResult.results.map((result) => (
                          <article
                            key={result.citation_id}
                            className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <strong>{result.title}</strong>
                                <Text
                                  size="xs"
                                  tone="muted"
                                  className="break-all"
                                >
                                  /{result.slug}
                                </Text>
                              </div>
                              <Tag color="primary">{result.citation_id}</Tag>
                            </div>
                            <Text size="sm">{result.snippet}</Text>
                            <div className="flex flex-wrap gap-2">
                              <Tag>{`Score ${result.score.toFixed(2)}`}</Tag>
                              <Tag>{`Semantic ${result.semantic_score.toFixed(2)}`}</Tag>
                              <Tag>{`Lexical ${result.lexical_score.toFixed(2)}`}</Tag>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Text size="xs" tone="muted">
                    {locale === "zh"
                      ? "输入问题并执行测试后，这里会展示真实检索证据。"
                      : "Run a test query to display real retrieval evidence here."}
                  </Text>
                )}
              </div>
            </Card>
          </section>

          <section
            className="flex flex-col gap-3"
            aria-labelledby="knowledge-embedding-title"
          >
            <div>
              <Heading
                id="knowledge-embedding-title"
                level={2}
                variant="compact"
              >
                {locale === "zh" ? "Embedding 配置" : "Embedding configuration"}
              </Heading>
              <Text size="sm" tone="muted">
                {locale === "zh"
                  ? "Embedding Profile 定义知识索引的语义空间；配置与索引内容、检索验证保持分层。"
                  : "Embedding profiles define the semantic space while configuration stays separate from indexed content and retrieval validation."}
              </Text>
            </div>

            {embeddingProfiles.length === 0 ? (
              <Card padding="base">
                <Empty
                  description={
                    locale === "zh"
                      ? "还没有 Embedding 配置。"
                      : "No embedding profiles configured."
                  }
                />
              </Card>
            ) : (
              <Card padding="none" className="overflow-hidden">
                <CardContent className="divide-y p-0">
                  {embeddingProfiles.map((profile) => {
                    const testing = testingConnections.includes(
                      `embedding:${profile.id}`,
                    );
                    return (
                      <div
                        key={profile.id}
                        className="flex flex-col gap-4 p-6 xl:flex-row xl:items-center xl:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong>{profile.name}</strong>
                            <Tag
                              color={profile.enabled ? "success" : "default"}
                            >
                              {profile.enabled
                                ? labels.active
                                : labels.paused}
                            </Tag>
                          </div>
                          <Text size="xs" tone="muted">
                            {profile.model} · {profile.dimensions} dimensions
                          </Text>
                          <Text
                            size="xs"
                            tone="muted"
                            className="break-all"
                          >
                            {profile.base_url} · API Key ••••{" "}
                            {profile.api_key_last4}
                          </Text>
                        </div>
                        <div className="flex min-w-max flex-nowrap items-center gap-1">
                          <IconButton
                            label={
                              testing
                                ? locale === "zh"
                                  ? "正在测试连接"
                                  : "Testing connection"
                                : labels.test
                            }
                            aria-busy={testing}
                            disabled={testing}
                            icon={
                              <RefreshCw
                                className={
                                  testing
                                    ? "agent-row-actions__spinner"
                                    : undefined
                                }
                              />
                            }
                            variant="ghost"
                            onClick={() =>
                              void onTestConnection(
                                "embedding",
                                profile.id,
                                profile.name,
                              )
                            }
                          />
                          <IconButton
                            label={labels.edit}
                            icon={<Edit2 />}
                            variant="ghost"
                            onClick={() => onEditEmbedding(profile)}
                          />
                          <IconButton
                            label={labels.delete}
                            icon={<Trash2 />}
                            variant="ghost"
                            color="error"
                            onClick={() =>
                              onDeleteTarget({
                                kind: "embedding",
                                value: profile,
                              })
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </SudoGate>
    </div>
  );
}
