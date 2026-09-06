import { useState } from "react";
import {
  Button,
  ConfirmDialog,
  Drawer,
  Field,
  Feedback,
  Input,
  Modal,
  PageHeader,
  Panel,
  PanelHeader,
  useConfirm,
  useToast,
} from "../src";

export function OverlayDemo() {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const { showSuccess, showError } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  return (
    <>
      <PageHeader
        title="状态与弹层"
        description="Dialog、Drawer、Confirm、Toast、表单错误和 Step-Up 的统一交互参考。"
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="弹层组合"
            description="验证焦点恢复、Escape 关闭和底部操作区。"
          />
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              打开 Dialog
            </Button>
            <Button onClick={() => setDrawerOpen(true)}>打开 Drawer</Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              危险确认
            </Button>
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="反馈与表单"
            description="错误播报和 Toast 反馈保持可访问。"
          />
          <div className="flex flex-col gap-4">
            <Field
              label="必填字段"
              error={invalid ? "请输入有效内容。" : undefined}
            >
              <Input invalid={invalid} placeholder="输入后点击验证" />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setInvalid(true)}>显示表单错误</Button>
              <Button
                variant="secondary"
                onClick={() => showSuccess("保存成功。")}
              >
                成功 Toast
              </Button>
              <Button
                variant="danger"
                onClick={() => showError("保存失败，请重试。")}
              >
                错误 Toast
              </Button>
            </div>
            {invalid ? (
              <Feedback type="error">
                错误状态会关联到表单控件，并使用 alert 语义播报。
              </Feedback>
            ) : null}
          </div>
        </Panel>
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Step-Up / 异步确认"
            description="静态模拟需要额外确认权限的高风险操作。"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              onClick={async () => {
                const accepted = await confirm({
                  title: "确认进入 Step-Up",
                  message: "继续后会要求额外身份验证（Demo 不会真的验证）。",
                  confirmLabel: "继续",
                });
                if (accepted) showSuccess("已进入 Step-Up 状态。");
              }}
            >
              触发 Step-Up
            </Button>
            <span className="self-center text-sm text-muted-foreground">
              不会发送请求，也不会修改会话。
            </span>
          </div>
        </Panel>
      </div>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Dialog 示例"
        description="共享 Modal 负责焦点管理和关闭行为。"
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                setModalOpen(false);
                showSuccess("Dialog 操作完成。");
              }}
            >
              确认
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          内容区支持表单、列表和错误状态，底部操作保持统一间距。
        </p>
      </Modal>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Drawer 示例"
        description="移动端优先的侧边编辑面板。"
        footer={
          <Button variant="primary" onClick={() => setDrawerOpen(false)}>
            完成
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="名称">
            <Input defaultValue="静态 Drawer 内容" />
          </Field>
          <Feedback type="info">长内容会在 Drawer 内部滚动。</Feedback>
        </div>
      </Drawer>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="确认删除示例"
        message="这是危险操作确认的静态示例。"
        onConfirm={() => {
          setConfirmOpen(false);
          showSuccess("已确认危险操作（Demo）。");
        }}
        confirmLabel="确认删除"
      />
      {confirmDialog}
    </>
  );
}
