import type { CSSProperties } from "react";

type BrandMarkProps = {
  src: string;
  className?: string;
};

export function BrandMark({ src, className = "size-6" }: BrandMarkProps) {
  const style: CSSProperties = {
    WebkitMask: `url("${src}") center / contain no-repeat`,
    mask: `url("${src}") center / contain no-repeat`,
  };

  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current ${className}`}
      style={style}
    />
  );
}
