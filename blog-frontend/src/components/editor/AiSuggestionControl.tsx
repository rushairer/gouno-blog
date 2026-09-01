import { Sparkles } from "lucide-react";
import { Button } from "../ui";

export function AiSuggestionControl({
  label,
  candidates,
  loading = false,
  open = false,
  mono = false,
  onRequest,
  onApply,
}: {
  label: string;
  candidates: string[];
  loading?: boolean;
  open?: boolean;
  mono?: boolean;
  onRequest: () => void;
  onApply: (value: string) => void;
}) {
  return (
    <div className="editor-ai-inline">
      <Button
        variant="link"
        className="editor-ai-inline__trigger"
        onClick={onRequest}
        disabled={loading}
        icon={<Sparkles />}
      >
        {loading ? "正在生成候选…" : label}
      </Button>
      {open && candidates.length > 0 ? (
        <div className="editor-ai-candidates" aria-label={`${label}候选`}>
          {candidates.map((item) => (
            <Button
              key={item}
              variant="ghost"
              className="editor-ai-candidate"
              onClick={() => onApply(item)}
            >
              <span className={mono ? "mono" : undefined}>{item}</span>
              <b>应用</b>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
