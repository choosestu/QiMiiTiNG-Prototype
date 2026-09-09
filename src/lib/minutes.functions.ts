import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Minutes approval workflow (Robert's Rules by-consent model).
// Electorate: members marked Present at the meeting who have a portal login.
// Each either approves as circulated or requests a correction; a single
// correction request pauses the round. When all eligible members have approved
// with no open correction, the minutes are approved by consent and may be stored.

type ReviewStatus = "draft" | "in_review" | "changes_requested" | "approved";

async function loadForAdmin(supabase: any, userId: string, meetingId: string) {
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error("No organization.");
  const { data: admin } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["chair", "secretary"])
    .limit(1)
    .maybeSingle();
  if (!admin) throw new Error("Only the Chair or Secretary can do this.");
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, organization_id")
    .eq("id", meetingId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (!meeting) throw new Error("Meeting not found.");
  return { orgId: profile.organization_id as string };
}

// The members eligible to vote: present at the meeting with a portal login.
async function eligibleVoters(
  admin: any,
  meetingId: string,
): Promise<{ userId: string; name: string }[]> {
  const { data: rows } = await admin
    .from("attendees")
    .select("user_id")
    .eq("meeting_id", meetingId)
    .eq("present", true)
    .not("user_id", "is", null);
  const ids = Array.from(
    new Set(((rows ?? []) as any[]).map((r) => r.user_id as string).filter(Boolean)),
  );
  if (ids.length === 0) return [];
  const { data: users } = await admin.from("users").select("id, name").in("id", ids);
  return ids.map((id) => ({
    userId: id,
    name: ((users ?? []) as any[]).find((u) => u.id === id)?.name ?? "Member",
  }));
}

async function loadReview(admin: any, meetingId: string) {
  const { data: m } = await admin
    .from("minutes")
    .select("approved_text, drive_url, review_status, review_round, review_started_at")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  return m as {
    approved_text: string | null;
    drive_url: string | null;
    review_status: ReviewStatus;
    review_round: number;
    review_started_at: string | null;
  } | null;
}

// Secretary/Chair sends the current minutes text to the exec for approval,
// opening a fresh review round. Also used to re-issue after an amendment.
export const sendMinutesForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string; minutesText: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId } = await loadForAdmin(supabase, userId, data.meetingId);
    if (!data.minutesText.trim()) throw new Error("Minutes text is required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const prior = await loadReview(supabaseAdmin, data.meetingId);
    const nextRound = (prior?.review_round ?? 0) + 1;

    // Audit-log the text change vs the previously circulated text.
    const { data: upserted } = await supabaseAdmin
      .from("minutes")
      .upsert(
        {
          meeting_id: data.meetingId,
          approved_text: data.minutesText,
          review_status: "in_review" as ReviewStatus,
          review_round: nextRound,
          review_started_at: new Date().toISOString(),
        } as never,
        { onConflict: "meeting_id" },
      )
      .select("id")
      .single();
    if (prior?.approved_text && prior.approved_text !== data.minutesText && upserted?.id) {
      await supabaseAdmin.from("minutes_edits").insert({
        minutes_id: upserted.id,
        edited_by: userId,
        original_text: prior.approved_text,
        corrected_text: data.minutesText,
      } as never);
    }

    const eligible = await eligibleVoters(supabaseAdmin, data.meetingId);
    void orgId;
    return { round: nextRound, eligibleCount: eligible.length };
  });

// A present member approves the minutes as circulated, or requests a correction.
export const castMinutesVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { meetingId: string; decision: "approved" | "changes_requested"; comment?: string }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("No organization.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const review = await loadReview(supabaseAdmin, data.meetingId);
    if (!review || (review.review_status !== "in_review" && review.review_status !== "changes_requested")) {
      throw new Error("These minutes are not open for review.");
    }
    const eligible = await eligibleVoters(supabaseAdmin, data.meetingId);
    if (!eligible.some((e) => e.userId === userId)) {
      throw new Error("Only members who were present at the meeting can vote on its minutes.");
    }
    if (data.decision === "changes_requested" && !(data.comment ?? "").trim()) {
      throw new Error("Please describe the correction you are requesting.");
    }

    await supabaseAdmin.from("minutes_approvals").upsert(
      {
        organization_id: profile.organization_id,
        meeting_id: data.meetingId,
        round: review.review_round,
        user_id: userId,
        decision: data.decision,
        comment: data.decision === "changes_requested" ? (data.comment ?? "").trim() : null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "meeting_id,round,user_id" },
    );

    // Tally the current round.
    const { data: votes } = await supabaseAdmin
      .from("minutes_approvals")
      .select("user_id, decision")
      .eq("meeting_id", data.meetingId)
      .eq("round", review.review_round);
    const rows = (votes ?? []) as { user_id: string; decision: string }[];
    const anyChanges = rows.some((v) => v.decision === "changes_requested");
    const approvedIds = new Set(rows.filter((v) => v.decision === "approved").map((v) => v.user_id));
    const allApproved =
      eligible.length > 0 && eligible.every((e) => approvedIds.has(e.userId));

    let nextStatus: ReviewStatus = "in_review";
    if (anyChanges) nextStatus = "changes_requested";
    else if (allApproved) nextStatus = "approved";

    const patch: Record<string, unknown> = { review_status: nextStatus };
    if (nextStatus === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = userId;
    }
    await supabaseAdmin.from("minutes").update(patch as never).eq("meeting_id", data.meetingId);

    return { reviewStatus: nextStatus, round: review.review_round };
  });

// Everything the meeting page needs to render the review, for admins and members.
export const getMinutesReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("No organization.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const review = await loadReview(supabaseAdmin, data.meetingId);
    if (!review) {
      return {
        exists: false as const,
        reviewStatus: "draft" as ReviewStatus,
        round: 0,
        minutesText: null as string | null,
        driveUrl: null as string | null,
        eligible: [] as { userId: string; name: string }[],
        votes: [] as { userId: string; name: string; decision: string; comment: string | null }[],
        myDecision: null as string | null,
        isEligible: false,
      };
    }
    const eligible = await eligibleVoters(supabaseAdmin, data.meetingId);
    const { data: voteRows } = await supabaseAdmin
      .from("minutes_approvals")
      .select("user_id, decision, comment")
      .eq("meeting_id", data.meetingId)
      .eq("round", review.review_round);
    const nameOf = (id: string) => eligible.find((e) => e.userId === id)?.name ?? "Member";
    const votes = ((voteRows ?? []) as any[]).map((v) => ({
      userId: v.user_id as string,
      name: nameOf(v.user_id as string),
      decision: v.decision as string,
      comment: (v.comment as string | null) ?? null,
    }));
    return {
      exists: true as const,
      reviewStatus: review.review_status,
      round: review.review_round,
      minutesText: review.approved_text,
      driveUrl: review.drive_url,
      eligible,
      votes,
      myDecision: votes.find((v) => v.userId === userId)?.decision ?? null,
      isEligible: eligible.some((e) => e.userId === userId),
    };
  });
