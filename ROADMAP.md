# QiMiiTiNG — Roadmap & Product Backlog

> Planning document. No code here — captured ideas, decisions, and constraints to act on
> *after* MVP. Reorder priorities freely. Tags: **[S/M/L]** = rough effort,
> **[⚖ compliance]** = needs legal/compliance review before shipping.

QiMiiTiNG is evolving from a **governance tool** into a **governance + communications tool**
for Liberal riding associations (EDAs), aimed at measurable results: donor retention,
membership growth, faster compliance, and clean institutional handover. Because every EDA
is a near-identical template, anything built for OFLA should generalize to all ridings.

---

## Binding guardrails (decided — these constrain every feature)

1. **No crossover from riding association to campaign.** No GOTV or campaign/electoral
   activities. QiMiiTiNG stays in the EDA *governance & association* lane only.
2. **Liberalist email rules.** OFLA is a paying Liberalist subscriber. Bulk email is
   restricted; for compliance, **only one member email address is viewable at a time**.
   → QiMiiTiNG must operate as **individual replies/sends**, never bulk blasts pulled from
   a harvested list. Using our own org mailboxes to reply to members is permitted.
3. **Consent is assumed** for member correspondence (Liberalist flags otherwise). Still,
   design the email engine with sender identification + unsubscribe affordances. **[⚖ compliance — CASL]**
4. **Donor thank-yous are stewardship, not receipts.** Official tax receipts are issued
   centrally by the party's registered agent — QiMiiTiNG notes must never appear to be one. **[⚖ compliance]**
5. **PII handling** (donor/member data) under PIPEDA + LPC privacy policy — matters more as
   the app goes multi-tenant. **[⚖ compliance]**

**Open architecture decision:** Liberalist is the upstream source for the daily donor file
and membership data. Decide deliberately whether QiMiiTiNG *imports from* Liberalist vs.
runs as a parallel system. Shapes everything downstream.

---

## Roles & access model

- **Role registry** — every automation targets a *role* (Chair, Treasurer, Secretary,
  Membership, Financial Agent…), not a person. Replace the person, automation keeps working. **[S]**
- **Role-based email routing** — route correspondence by role: e.g. "thanks for signing up"
  → Chair; "update the riding's bank balance" → Treasurer (Sara). **[S]**
- **Institutional handover** — each incoming exec member inherits:
  - access to the **work/records of the previous holder** of that position, and
  - a **written description of the position** (duties, recurring obligations). **[M]**
- **Account lifecycle tied to governance events** (see triggers below).

---

## Event-driven automations (from minutes → actions)

- **AGM — new exec elected + minutes approved →**
  - provision **new logins** for each newly-filled role,
  - hand over predecessor's records + role description to each new holder,
  - trigger **Elections Canada reporting** obligations for the leadership change. **[M] [⚖ compliance]**
- **Exec meeting — role change passed by vote, OR an exec resigns →**
  minutes trigger a notification to all interested parties of the change: **LPC and Elections
  Canada**. **[M] [⚖ compliance]**
- General pattern: **approved minutes are the source of truth** that fire downstream actions
  (provisioning, notifications, reporting). **[M]**

---

## Communications

- **Triage inbox** — incoming correspondence is classified (agenda item / FYI / action-by-role
  / donation), **flagged for approval**, then routed (→ agenda, → task, → thank-you). **[M]**
- **Correspondence → agenda** — flagged items, once approved, are added to the meeting agenda. **[S]**
- **Donation acknowledgment** — open the daily *"Registered Liberals and Donors"* file, find
  new donations, send a brief **local-level thank-you** (individual sends, per guardrail #2).
  Tiered: first-time → warm welcome; recurring → light touch; **major donor → flag for a
  personal call from the Chair**, not auto-email. Goal metric: **donor retention**. **[M] [⚖ compliance]**
  - **Regular-donor list as a *suppression* list** (most give via the **Victory Fund** — a
    small, stable, repeat set the org can compile once from known donors; sidesteps Liberalist's
    one-email-at-a-time rule, no harvesting). The daily file's job shrinks to **change detection**:
    flag who is *not* on the known-recurring list.
  - **Don't thank recurring donors every monthly charge** (feels automated/hollow). Personal
    thank-you fires on *meaningful* events only: **new donor, one-time gift, increase, or lapsed-returned**.
    Recurring donors get a rarer **year-end / anniversary** "thank you for N months" note.
  - This reframing makes the feature simpler (match-against-known-list, not parse-from-scratch)
    → moves it from "Phase 3, validate first" toward a realistic **Phase 2** candidate.

---

## Financial & Elections Canada compliance

- **Auto-reconcile** the daily donor file into a running ledger → fast annual EDA financial
  return prep for the Financial Agent. **[M]**
- **Contribution-limit tracking** — flag donors approaching the federal annual limit *before*
  they exceed it. **[M] [⚖ compliance]**
- **Compliance calendar** — Elections Canada deadlines are identical across ridings;
  build-once / serve-all. **[S]**

---

## Membership (association, not campaign)

- Membership **expiry tracking + renewal reminders** (membership = nomination voting eligibility). **[M]**
- New-member **welcome** sequence (individual sends). **[S]**
- Membership-growth dashboard. **[S]**

---

## Governance (extends what's built)

- Officer-**term tracking** with **vacancy alerts**. **[S]**
- **Quorum tracking** for AGMs/exec meetings. **[S]**
- **Motion register** with carry-forward of unfinished business. **[M]**

---

## Events (non-campaign)

- Fundraiser / town-hall **RSVPs + reminders**. **[M]**
- (Explicitly excludes GOTV / campaign events — see guardrail #1.)

---

## Multi-EDA platform (turns the tool into a product)

- **One-click new-riding setup** by cloning the OFLA template. **[M]**
- **Anonymized benchmarking** across ridings (membership growth, donor retention, funds
  raised) — the "measurable results" story for the party. **[L]**
- **Regional/national roll-up reporting** for organizers. **[L]**
- **Shared template library** (compliant donor letters, agenda templates, notices). **[S]**
- **Platform-owner ("super-admin") access** — log in as owner to administer any org from the
  UI (org switcher + cross-org policies). Today owner repairs happen via the Supabase backend;
  this would make it a first-class in-app capability. **[L]**

---

## Known issues & small fixes (found during testing 2026-06-23)

- 🐞 **"Manage allowlist" button does nothing.** `/settings/allowlist` is a child route of
  `/settings`, but `settings.tsx` renders no `<Outlet/>`, so the child never mounts. Fix:
  make `settings.tsx` a layout (`<Outlet/>`) + move its page content to `settings.index.tsx`. **[S]**
- ➕ **Add "Cancel meeting" button** (Chair/Secretary). Set meeting `status = 'cancelled'`
  (add to `STATUS_LABEL`) rather than hard-deleting, so the record/audit trail survives.
  Confirm dialog before applying. **[S]**
- ℹ️ **Google "Access blocked / 401 invalid_client"** is expected until the Google OAuth app
  is created + keys set in Railway (MVP step 3). Not a bug.

**Deploy-path decision needed before code changes:** confirm whether edits flow
Lovable → GitHub → Railway, or via direct push to `choosestu/QiMiiTiNG-Prototype`. Lovable
also auto-syncs to that branch, so uncoordinated edits can conflict.

## MVP checklist (finish before building the above)

1. ✅ App live on Railway + self-owned Supabase, login works, dashboard reachable
2. ⬜ Account cleanup — `oshawafederalliberal@gmail.com` = OFLA Chair; `stuart@thefoundation.ca` = platform owner
3. ⬜ Google OAuth wired (Google Cloud app + `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` + state secret in Railway) → connect `communications@oshawaliberals.ca`
4. ⬜ AI agenda-generation provider key (verify if required)
5. ⬜ Run one meeting end-to-end: create → agenda → notice → minutes → Drive folder
6. ⬜ Cleanup: remove `src/routes/api/admin/bootstrap.ts`; revoke temp Supabase token (`.sbtoken.txt`)
