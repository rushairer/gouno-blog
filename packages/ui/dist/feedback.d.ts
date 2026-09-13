import { type ReactNode, type HTMLAttributes } from "react";
export type FeedbackType = "error" | "success" | "warning" | "info";
export type Tone = FeedbackType | "danger" | "neutral" | "brand";
export declare function Feedback({ type, children, className, }: {
    type: FeedbackType;
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function Banner({ tone, icon, children, className, }: {
    tone?: Tone;
    icon?: ReactNode;
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function NoticeCard({ tone, title, children, action, className, }: {
    tone?: Tone;
    title?: ReactNode;
    children?: ReactNode;
    action?: ReactNode;
    className?: string;
}): import("react").JSX.Element;
interface StateProps {
    title?: ReactNode;
    label?: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    icon?: ReactNode;
    className?: string;
}
export declare function EmptyState({ title, label, description, action, icon, className, }: StateProps): import("react").JSX.Element;
export declare function ErrorState(props: StateProps): import("react").JSX.Element;
export declare function LoadingSpinner({ size, className, }: {
    size?: "sm" | "md" | "lg";
    className?: string;
}): import("react").JSX.Element;
export declare function LoadingState({ label, className, }: {
    label?: string;
    className?: string;
}): import("react").JSX.Element;
export declare const PageLoader: ({ message }: {
    message?: string;
}) => import("react").JSX.Element;
export declare function AdminPageState({ title, description, label, }: {
    title: string;
    description?: ReactNode;
    label: string;
}): import("react").JSX.Element;
export interface AsyncStateProps {
    loading: boolean;
    loadingLabel?: string;
    loadingMessage?: string;
    skeleton?: ReactNode;
    error?: string | null;
    empty?: boolean;
    emptyState?: ReactNode;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyAction?: ReactNode;
    emptyIcon?: ReactNode;
    onRetry?: () => void;
    retryLabel?: string;
    children: ReactNode;
}
export declare function AsyncState({ loading, loadingLabel, loadingMessage, skeleton, error, empty, emptyState, emptyTitle, emptyDescription, emptyAction, emptyIcon, onRetry, retryLabel, children, }: AsyncStateProps): import("react").JSX.Element;
export declare function Skeleton({ variant, width, height, style, className, ...props }: HTMLAttributes<HTMLDivElement> & {
    variant?: "text" | "circular" | "rectangular" | "card";
    width?: string | number;
    height?: number | string;
}): import("react").JSX.Element;
export declare function TableSkeleton({ rows, columns, className, label, }: {
    rows?: number;
    columns?: number;
    className?: string;
    label?: string;
}): import("react").JSX.Element;
export declare function ArticleListSkeleton({ count, className, }: {
    count?: number;
    className?: string;
}): import("react").JSX.Element;
type ToastApi = {
    notify: (message: string, type?: FeedbackType, options?: {
        duration?: number;
    }) => void;
    showSuccess: (message: string) => void;
    showError: (message: string) => void;
    showInfo: (message: string) => void;
};
export declare function useToast(): ToastApi;
export declare function ToastProvider({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function Toast({ toast: message, onDismiss, }: {
    toast: {
        id?: number;
        message: string;
        type?: FeedbackType;
        tone?: string;
    };
    onDismiss?: () => void;
}): null;
export declare function copyText(value: string, notify: ToastApi["notify"], successMessage?: string): Promise<boolean>;
export {};
