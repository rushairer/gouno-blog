import { useEffect, useMemo, useState } from "react";
import { workflowApi } from "../../api/workflows";
import type { ResourceOption } from "../../api/workflows";
import type { Workflow } from "../../types/agent";
import {
  Alert,
  ButtonLink,
  FormField,
  Modal,
  Select,
  Text,
} from "@gouno/ui/core";
import { WorkflowInputForm } from "./WorkflowInputForm";

type WorkflowLauncherResourceType =
  | "post"
  | "comment"
  | "media_asset"
  | "operational_suggestion"
  | "category"
  | "tag"
  | "page";

const resourceLabels: Record<WorkflowLauncherResourceType, string> = {
  post: "文章",
  comment: "评论",
  media_asset: "媒体",
  operational_suggestion: "运营建议",
  category: "分类",
  tag: "标签",
  page: "单页",
};

function schemaProperties(workflow: Workflow) {
  return (workflow.input_schema.properties || {}) as Record<
    string,
    Record<string, unknown>
  >;
}

function resourceField(
  workflow: Workflow,
  type: WorkflowLauncherResourceType,
): string | undefined {
  const properties = schemaProperties(workflow);
  return Object.keys(properties).find(
    (name) => properties[name]?.["x-gouno-resource"] === type,
  );
}

function editableSchema(
  workflow: Workflow,
  type: WorkflowLauncherResourceType,
): Record<string, unknown> | null {
  const properties = schemaProperties(workflow);
  const editableProperties = Object.fromEntries(
    Object.entries(properties).filter(
      ([, property]) => property["x-gouno-resource"] !== type,
    ),
  );
  if (Object.keys(editableProperties).length === 0) return null;
  return { ...workflow.input_schema, properties: editableProperties };
}

function initialInput(
  workflow: Workflow,
  type: WorkflowLauncherResourceType,
  keys: Array<number | string>,
) {
  const properties = schemaProperties(workflow);
  const value: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    if (property["x-gouno-resource"] === type)
      value[name] = property.type === "array" ? keys : keys[0];
    else if (property.type === "array") value[name] = [];
    else if (property.type === "boolean") value[name] = false;
    else if (Array.isArray(property.enum)) value[name] = property.enum[0];
    else if (property.type === "integer" || property.type === "number")
      value[name] = 0;
    else value[name] = "";
  }
  return value;
}

export function WorkflowLauncher({
  open,
  resourceType,
  resourceKeys,
  onClose,
  title = "交给 AI",
}: {
  open: boolean;
  resourceType: WorkflowLauncherResourceType;
  resourceKeys: Array<number | string>;
  onClose: () => void;
  title?: string;
}) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowID, setWorkflowID] = useState<number | "">("");
  const [input, setInput] = useState<Record<string, unknown>>({});
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [unavailableResourceKeys, setUnavailableResourceKeys] = useState<
    string[]
  >([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loadingResources, setLoadingResources] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingWorkflows(true);
    workflowApi
      .getWorkflows()
      .then((items) => {
        const compatible = items.filter(
          (item) => item.enabled && resourceField(item, resourceType),
        );
        setWorkflows(compatible);
        const first = compatible[0];
        setWorkflowID(first?.id || "");
        setInput(first ? initialInput(first, resourceType, resourceKeys) : {});
        setFeedback(null);
      })
      .catch((reason: Error) =>
        setFeedback({ type: "error", text: reason.message }),
      )
      .finally(() => setLoadingWorkflows(false));
  }, [open, resourceKeys, resourceType]);

  useEffect(() => {
    if (!open || resourceKeys.length === 0) {
      setResources([]);
      setUnavailableResourceKeys([]);
      return;
    }
    const controller = new AbortController();
    const parameters = new URLSearchParams();
    resourceKeys.forEach((key) => parameters.append("key", String(key)));
    setLoadingResources(true);
    workflowApi
      .getResources(resourceType, parameters, controller.signal)
      .then((result) => {
        setResources(result.list || []);
        setUnavailableResourceKeys(result.unavailable_keys || []);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") {
          setResources([]);
          setUnavailableResourceKeys(resourceKeys.map(String));
        }
      })
      .finally(() => setLoadingResources(false));
    return () => controller.abort();
  }, [open, resourceKeys, resourceType]);

  const workflow = useMemo(
    () => workflows.find((item) => item.id === workflowID),
    [workflowID, workflows],
  );
  const workflowEditableSchema = useMemo(
    () => (workflow ? editableSchema(workflow, resourceType) : null),
    [resourceType, workflow],
  );
  const resourcesByKey = useMemo(
    () => new Map(resources.map((resource) => [resource.key, resource])),
    [resources],
  );

  const choose = (id: number) => {
    const next = workflows.find((item) => item.id === id);
    setWorkflowID(id);
    setInput(next ? initialInput(next, resourceType, resourceKeys) : {});
    setFeedback(null);
  };

  const run = async () => {
    if (!workflow || resourceKeys.length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await workflowApi.run(workflow.id, input);
      setFeedback({
        type: "success",
        text: `Workflow 已提交（Run #${result.id}）。范围已固定为本次选择的 ${resourceKeys.length} 项资源。`,
      });
    } catch (reason) {
      setFeedback({
        type: "error",
        text: reason instanceof Error ? reason.message : "Workflow 运行失败。",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      description={`已选择 ${resourceKeys.length} 项资源；Workflow 默认只能访问这些目标。`}
      onClose={onClose}
      onOk={run}
      okText="运行"
      cancelText="关闭"
      confirmLoading={busy}
      okButtonProps={{
        variant: "solid",
        color: "primary",
        disabled: !workflow || resourceKeys.length === 0,
      }}
    >
      <div className="flex flex-col gap-4">
        {loadingWorkflows ? (
          <Text size="sm" tone="muted">
            正在加载 Workflow…
          </Text>
        ) : workflows.length > 0 ? (
          <>
            <FormField label="Workflow">
              <Select
                aria-label="Workflow"
                value={workflowID === "" ? "" : String(workflowID)}
                onChange={(nextValue) => choose(Number(nextValue))}
              >
                {workflows.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </FormField>
            {workflow?.description ? (
              <Text size="xs" tone="muted">
                {workflow.description}
              </Text>
            ) : null}
          </>
        ) : (
          <Alert
            type="warning"
            showIcon
            title="没有兼容 Workflow"
            description="真实产品只显示 input schema 声明了当前资源类型的已启用 Workflow。请先在 AI 运营创建或启用一个兼容流程。"
          />
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text size="sm" className="font-medium">
              {resourceLabels[resourceType]}
            </Text>
            <Text size="xs" tone="muted">
              范围来自当前页面选择，启动后不可在此修改
            </Text>
          </div>
          {resourceKeys.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              {resourceKeys.map((key) => {
                const resource = resourcesByKey.get(String(key));
                const unavailable = unavailableResourceKeys.includes(String(key));
                return (
                  <div key={String(key)} className="min-w-0">
                    <Text size="sm" className="truncate">
                      {resource?.label || `${resourceLabels[resourceType]} #${key}`}
                    </Text>
                    <Text size="xs" tone={unavailable ? "danger" : "muted"}>
                      {unavailable
                        ? "资源已删除或当前不可用"
                        : resource?.description ||
                          (loadingResources ? "正在解析资源…" : `ID ${key}`)}
                    </Text>
                  </div>
                );
              })}
            </div>
          ) : (
            <Alert
              type="warning"
              showIcon
              title={`至少选择 1 个${resourceLabels[resourceType]}资源才能运行。`}
            />
          )}
        </div>

        {workflow && workflowEditableSchema ? (
          <WorkflowInputForm
            schema={workflowEditableSchema}
            value={input}
            onChange={setInput}
          />
        ) : null}

        {feedback ? (
          <Alert
            type={feedback.type}
            showIcon
            title={feedback.text}
            action={
              feedback.type === "success" && workflow ? (
                <ButtonLink
                  variant="link"
                  href={`/admin/ai-ops?tab=records&record=workflow&workflow=${workflow.id}`}
                >
                  打开运行中心
                </ButtonLink>
              ) : undefined
            }
          />
        ) : null}
      </div>
    </Modal>
  );
}
