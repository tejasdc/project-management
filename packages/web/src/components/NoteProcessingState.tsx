import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrapJson } from "../lib/api-client";

export function NoteProcessingState({ note }: { note: { id: string; processed: boolean; processingError?: string | null } }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: async () => unwrapJson(await api.api.notes[":id"].reprocess.$post({ param: { id: note.id } })),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  if (note.processingError) return (
    <span className="text-xs text-[var(--confidence-low)]">
      {note.processingError}{" "}
      <button type="button" className="underline font-semibold" disabled={retry.isPending} onClick={() => retry.mutate()}>
        {retry.isPending ? "Queuing…" : "Reprocess"}
      </button>
      {retry.error && <span role="alert"> {retry.error.message}</span>}
    </span>
  );
  return <span className="text-xs text-[var(--text-secondary)]">{note.processed ? "Processed" : "Processing…"}</span>;
}
