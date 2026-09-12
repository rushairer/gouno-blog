import type { ReactNode } from "react";
import { Modal } from "@gouno/ui/core";

export interface ConfirmActionModalProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  message?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  danger?: boolean;
  confirmVariant?: "danger" | "primary";
  busy?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose?: () => void;
  onCancel?: () => void;
}

export function ConfirmActionModal({
  open,
  title,
  description,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  confirmVariant,
  busy = false,
  loading = false,
  onConfirm,
  onClose,
  onCancel,
}: ConfirmActionModalProps) {
  const pending = busy || loading;
  const close = onClose ?? onCancel ?? (() => {});
  const destructive = danger || confirmVariant === "danger";

  return (
    <Modal
      open={open}
      title={title}
      description={message ?? description}
      okText={confirmLabel}
      cancelText={cancelLabel}
      confirmLoading={pending}
      closeOnEsc={!pending}
      closeOnBackdrop={!pending}
      showCloseButton={false}
      onOpenChange={(next) => {
        if (!next && !pending) close();
      }}
      onOk={() => void onConfirm()}
      okButtonProps={destructive ? { color: "error" } : undefined}
    />
  );
}
