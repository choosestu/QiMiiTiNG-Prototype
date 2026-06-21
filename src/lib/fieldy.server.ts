// Server-only Fieldy API client. Uses FIELDY_API_KEY secret.
// Docs: https://intercom.help/Fieldy/en/articles/15019124
const BASE = "https://api.fieldy.ai/api/public/v2";

export type FieldySegment = {
  id?: string;
  text: string;
  speaker?: string | null;
  speaker_profile_id?: string | null;
  start?: number | null;
  end?: number | null;
  timestamp?: string | null;
};

function key() {
  const k = process.env.FIELDY_API_KEY;
  if (!k) throw new Error("FIELDY_API_KEY is not configured.");
  return k;
}

export async function fetchFieldyTranscriptions(args: {
  startTime: string; // ISO
  endTime: string; // ISO
  pageSize?: number;
}): Promise<FieldySegment[]> {
  const url = new URL(`${BASE}/transcriptions`);
  url.searchParams.set("startTime", args.startTime);
  url.searchParams.set("endTime", args.endTime);
  url.searchParams.set("pageSize", String(args.pageSize ?? 200));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key()}` },
  });
  if (!res.ok) {
    throw new Error(`Fieldy transcriptions failed (${res.status}): ${await res.text()}`);
  }
  const j = (await res.json()) as any;
  const rows: any[] = Array.isArray(j) ? j : (j.data ?? j.items ?? j.transcriptions ?? j.results ?? []);
  return rows.map((r): FieldySegment => ({
    id: r.id ?? r.segment_id ?? r.segmentId,
    text: r.text ?? r.content ?? "",
    speaker: r.speaker ?? r.speaker_name ?? r.speakerName ?? null,
    speaker_profile_id: r.speaker_profile_id ?? r.speakerProfileId ?? r.speaker_id ?? null,
    start: r.start ?? r.start_offset ?? r.startOffset ?? null,
    end: r.end ?? r.end_offset ?? r.endOffset ?? null,
    timestamp: r.timestamp ?? r.created_at ?? r.createdAt ?? null,
  })).filter((s) => s.text && s.text.trim().length > 0);
}
