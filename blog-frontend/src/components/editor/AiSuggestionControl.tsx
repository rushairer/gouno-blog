import { LoaderCircle, Sparkles } from "lucide-react";

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
      <button type="button" onClick={onRequest} disabled={loading}>
        <Sparkles />
        {loading ? (
          <>
            <LoaderCircle className="is-spinning" /> 正在生成候选…
          </>
        ) : (
          label
        )}
      </button>
      {open && candidates.length > 0 ? (
        <div className="editor-ai-candidates" aria-label={`${label}候选`}>
          {candidates.map((item) => (
            <button key={item} type="button" onClick={() => onApply(item)}>
              <span className={mono ? "mono" : undefined}>{item}</span>
              <b>应用</b>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
