import { Skeleton } from "@gouno/ui/core";

type DiscoveryPage = "categories" | "tags" | "archive";

export function DiscoveryIndexLoading({ page }: { page: DiscoveryPage }) {
  const count = page === "archive" ? 3 : 6;
  const label =
    page === "categories" ? "分类" : page === "tags" ? "标签" : "归档";

  return (
    <div
      role="status"
      aria-label={`${label}加载中`}
      className={
        page === "archive"
          ? "space-y-8"
          : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={index}
          className={
            page === "archive" ? "h-24 w-full" : "h-36 w-full rounded-lg"
          }
        />
      ))}
    </div>
  );
}
