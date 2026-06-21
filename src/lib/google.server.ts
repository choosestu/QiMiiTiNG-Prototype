// Server-only Google Workspace helpers (Gmail + Drive) using per-org OAuth tokens
// stored in organizations.google_oauth_tokens.
import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
  scope?: string;
  token_type?: string;
  email?: string;
};

function stateSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "fallback-state-secret";
}

export function signState(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState<T = Record<string, unknown>>(token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as T & { exp?: number };
    if (json.exp && Date.now() > json.exp) return null;
    return json;
  } catch {
    return null;
  }
}

export function buildAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const j = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
  };
  let email: string | undefined;
  if (j.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString("utf-8"));
      email = payload.email;
    } catch {}
  }
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in - 60) * 1000,
    scope: j.scope,
    token_type: j.token_type,
    email,
  };
}

async function refreshTokens(refresh_token: string): Promise<Partial<GoogleTokens>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  return { access_token: j.access_token, expires_at: Date.now() + (j.expires_in - 60) * 1000, scope: j.scope };
}

export async function getValidAccessToken(orgId: string): Promise<{ token: string; email?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("google_oauth_tokens")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw error;
  const tokens = data?.google_oauth_tokens as GoogleTokens | null;
  if (!tokens?.access_token) throw new Error("Google account not connected for this organization.");
  if (Date.now() < tokens.expires_at - 30_000) return { token: tokens.access_token, email: tokens.email };
  if (!tokens.refresh_token) throw new Error("Google session expired and no refresh token available. Please reconnect.");
  const refreshed = await refreshTokens(tokens.refresh_token);
  const merged: GoogleTokens = { ...tokens, ...refreshed };
  await supabaseAdmin.from("organizations").update({ google_oauth_tokens: merged as never }).eq("id", orgId);
  return { token: merged.access_token, email: merged.email };
}

// ---------- Drive ----------

async function driveSearch(token: string, q: string): Promise<{ id: string; name: string }[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive search failed: ${await res.text()}`);
  return ((await res.json()) as { files?: { id: string; name: string }[] }).files ?? [];
}

async function driveCreateFolder(token: string, name: string, parentId?: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
  if (!res.ok) throw new Error(`Drive create folder failed: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function ensureFolder(token: string, name: string, parentId?: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentClause}`;
  const found = await driveSearch(token, q);
  if (found[0]) return found[0].id;
  return driveCreateFolder(token, name, parentId);
}

export type MeetingFolderInfo = { folderId: string; folderName: string; yearFolderId: string; rootFolderId: string };

export async function ensureMeetingFolder(
  orgId: string,
  meeting: { id: string; meeting_date: string; meeting_type: string },
): Promise<MeetingFolderInfo> {
  const { token } = await getValidAccessToken(orgId);
  const date = meeting.meeting_date.slice(0, 10); // YYYY-MM-DD
  const year = date.slice(0, 4);
  const folderName = `${date} ${meeting.meeting_type}`;
  const root = await ensureFolder(token, "01 - Meetings");
  const yearFolder = await ensureFolder(token, year, root);
  const meetingFolder = await ensureFolder(token, folderName, yearFolder);
  // persist drive_folder_id
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("meetings").update({ drive_folder_id: meetingFolder }).eq("id", meeting.id);
  return { folderId: meetingFolder, folderName, yearFolderId: yearFolder, rootFolderId: root };
}

export async function uploadPdfToMeeting(
  orgId: string,
  meeting: { id: string; meeting_date: string; meeting_type: string },
  filename: string,
  bytes: Uint8Array,
): Promise<{ id: string; webViewLink: string }> {
  const { token } = await getValidAccessToken(orgId);
  const { folderId } = await ensureMeetingFolder(orgId, meeting);

  // Replace existing file with same name in folder.
  const safe = filename.replace(/'/g, "\\'");
  const existing = await driveSearch(token, `name='${safe}' and '${folderId}' in parents and trashed=false`);
  for (const f of existing) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  const boundary = "----qmtng" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name: filename, parents: [folderId], mimeType: "application/pdf" });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Drive upload failed: ${await res.text()}`);
  return (await res.json()) as { id: string; webViewLink: string };
}

// ---------- Gmail ----------

function b64url(input: string | Uint8Array): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmail(
  orgId: string,
  args: { to: string[]; subject: string; html: string; replyTo?: string },
): Promise<{ messageId: string }> {
  const { token, email: fromEmail } = await getValidAccessToken(orgId);
  const headers = [
    `From: ${fromEmail ?? "me"}`,
    `To: ${args.to.join(", ")}`,
    args.replyTo ? `Reply-To: ${args.replyTo}` : "",
    `Subject: ${args.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    args.html,
  ]
    .filter(Boolean)
    .join("\r\n");
  const raw = b64url(headers);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`);
  const j = (await res.json()) as { id: string };
  return { messageId: j.id };
}
