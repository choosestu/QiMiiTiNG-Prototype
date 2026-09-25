import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Temporary until a booking page exists. No support inbox is defined in the
// repo; stuart@thefoundation.ca is the platform owner address.
const SUPPORT_EMAIL = "stuart@thefoundation.ca";
const BOOKING_URL = "mailto:stuart@thefoundation.ca?subject=QiMiiTiNG%20walkthrough";

const PAGE_TITLE = "Pricing | QiMiiTiNG";
const PAGE_DESCRIPTION =
  "One plan for your whole board: $75 CAD a month or $750 a year, no setup fee.";

type Billing = "monthly" | "annual";

const PLAN_B = {
  monthly: {
    price: 75,
    unit: "month",
    note: "$0 setup. Cancel with 30 days' notice.",
  },
  annual: {
    price: 750,
    unit: "year",
    note: "That is 10 months' price for 12. Save $150 a year versus monthly ($900). $0 setup.",
    badge: "Best value: 2 months free",
  },
  currency: "CAD",
} as const;

const PLAN_A_NOTE = { monthly: 150, monthlyOwnDevice: 125, setup: 1100 };

const INCLUDED = [
  "Unlimited meetings for your executive or board",
  "Position-based seats with a portal for each role, so the work stays with the position when people change (clean AGM handoff)",
  "Officer and financial report requests, with in-app report submission",
  "AI-drafted agendas grounded in Robert's Rules, reviewed by your Chair before they go out",
  "Meeting notices sent from your association's own Gmail account",
  "Attendance, regrets, and quorum checks before call to order",
  "Motions recorded verbatim with mover, seconder, and vote tally",
  "Pre-adjournment checklist so nothing is missed",
  "AI-drafted minutes, Secretary-reviewed, then approved by consent of the members who were present",
  "Edits to minutes are logged for a clear governance record",
  "Approved agendas and minutes filed as PDFs in your association's Google Drive",
  "Guided setup checklist and email support (reply target: 2 business days)",
] as const;

const VALUE_BLOCKS = [
  {
    title: "Your records stay yours.",
    body: "Agendas and approved minutes are filed in your association's Google Workspace, which stays the source of truth. You own your data.",
  },
  {
    title: "Each organization is walled off.",
    body: "Organization-level data isolation is enforced in the database, so one board never sees another board's records.",
  },
  {
    title: "Built for handover.",
    body: "Positions, not people, hold the history. When a new executive is elected at the AGM, they inherit the role's records and notes.",
  },
] as const;

const FAQ = [
  {
    id: "notetaker",
    question: "Is this just an AI notetaker?",
    answer:
      "No. Recording is optional. QiMiiTiNG runs the whole meeting cycle: collecting reports, sending notice, building the agenda, capturing motions correctly, getting minutes approved, and filing them.",
  },
  {
    id: "billing",
    question: "What is the difference between monthly and annual?",
    answer:
      "Same product, same features. Annual is $750 for the year, which is 10 months' price, so you get 2 months free and save $150 compared with paying monthly.",
  },
  {
    id: "setup",
    question: "Is there a setup fee?",
    answer:
      "No. $0 setup on both monthly and annual. You get a guided setup checklist, and we help you get your first meeting on the calendar.",
  },
  {
    id: "hardware",
    question: "Do we need special hardware?",
    answer:
      "No. A laptop and your association's Google account are enough. In-room recording with a Fieldy device is optional and only part of the premium option.",
  },
  {
    id: "documents",
    question: "Where are our documents stored?",
    answer:
      "Agendas and approved minutes are saved as PDFs in your association's Google Drive, in a 01 - Meetings / [Year] / [Date Meeting Type] folder structure. Meeting notices go out from your association's Gmail account.",
  },
  {
    id: "google",
    question: "What Google access does QiMiiTiNG ask for?",
    answer:
      "Your Chair or Secretary connects the association's Google account. QiMiiTiNG asks to send mail, read mail and calendar (to find emailed officer reports and upcoming dates for the agenda), and read and create Drive files (to file agendas and minutes and to search your records). You can disconnect at any time in Settings.",
  },
  {
    id: "isolation",
    question: "Can other organizations see our information?",
    answer: "No. Each organization's data is isolated at the database level.",
  },
  {
    id: "ownership",
    question: "Who owns our data?",
    answer: "Your association does.",
  },
  {
    id: "campaign",
    question: "Is this a campaign or election tool?",
    answer:
      "No. QiMiiTiNG is for board governance only. It does not do campaign, get-out-the-vote, or bulk email blasts.",
  },
  {
    id: "cancel",
    question: "Can we cancel?",
    answer:
      "Monthly plans renew month to month; give 30 days' notice to cancel. Annual plans run 12 months and renew unless cancelled 30 days before the term ends.",
  },
  {
    id: "legal",
    question: "Do you have a privacy policy and terms?",
    answer:
      "They are being finalized and will be part of your order form. Until then, we are happy to walk through how your data is handled on the call.",
  },
] as const;

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESCRIPTION },
    ],
  }),
  component: PricingPage,
});

function formatCad(amount: number) {
  const formatted = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${formatted}`;
}

function PricingPage() {
  const [billing, setBilling] = useState<Billing>("annual");

  return (
    <main className="bg-background">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 text-sm">
        <Link to="/" className="font-serif text-lg font-semibold text-foreground" data-touch-target>
          QiMiiTiNG
        </Link>
        <Link to="/auth" className="text-muted-foreground hover:text-foreground" data-touch-target>
          Sign in
        </Link>
      </nav>

      <section className="mx-auto max-w-4xl px-4 pb-12 pt-8 text-center sm:pt-14">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Pricing</p>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          One simple plan for your whole board
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          QiMiiTiNG is the governance operating system for volunteer boards: reports, notices,
          agendas, motions, minutes, and follow-through, run the way Robert's Rules intended. Not a
          notetaker. One organization, one price, no setup fee.
        </p>

        <div className="mx-auto mt-8 flex w-full justify-center">
          <BillingToggle value={billing} onChange={setBilling} />
        </div>

        <PlanCard billing={billing} />

        <p className="mx-auto mt-4 max-w-2xl text-xs text-muted-foreground">
          Prices in Canadian dollars. Applicable taxes extra, if any. Billed to the association.
        </p>
      </section>

      <PremiumStrip />
      <ValueBlocks />
      <PricingFaq />
      <ClosingCta />
    </main>
  );
}

function BillingToggle({
  value,
  onChange,
}: {
  value: Billing;
  onChange: (value: Billing) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (next === "monthly" || next === "annual") onChange(next);
      }}
    >
      <TabsList className="flex h-auto w-full flex-col sm:w-auto sm:flex-row">
        <TabsTrigger value="monthly" className="w-full px-4 py-2 sm:w-auto">
          Monthly
        </TabsTrigger>
        <TabsTrigger
          value="annual"
          className="w-full whitespace-normal px-4 py-2 sm:w-auto sm:whitespace-nowrap"
        >
          Annual (best value, 2 months free)
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function PlanCard({ billing }: { billing: Billing }) {
  return (
    <Card className="mx-auto mt-8 max-w-2xl text-left">
      <CardHeader>
        <CardTitle className="font-serif text-2xl">QiMiiTiNG Board</CardTitle>
      </CardHeader>
      <CardContent>
        <PricePanel cycle="annual" active={billing === "annual"} />
        <PricePanel cycle="monthly" active={billing === "monthly"} />

        <h2 className="mt-8 text-sm font-semibold text-foreground">Included</h2>
        <ul className="mt-4 space-y-3">
          {INCLUDED.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col gap-3">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <a href={BOOKING_URL} data-touch-target>
              Book a 20-minute walkthrough
            </a>
          </Button>
          <p className="text-sm text-muted-foreground">
            Questions? Email us at{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center font-medium text-primary underline-offset-4 hover:underline"
              data-touch-target
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function PricePanel({ cycle, active }: { cycle: Billing; active: boolean }) {
  const plan = PLAN_B[cycle];
  return (
    <div hidden={!active} data-billing={cycle}>
      {cycle === "annual" ? <Badge className="mb-4">{PLAN_B.annual.badge}</Badge> : null}
      <p className="font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {`$${plan.price} ${PLAN_B.currency} / ${plan.unit}`}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">per organization</p>
      <p className="mt-3 text-sm text-foreground">{plan.note}</p>
    </div>
  );
}

function PremiumStrip() {
  return (
    <section className="mx-auto max-w-4xl px-4 pb-16">
      <div className="rounded-xl border border-border bg-card px-5 py-4 text-left text-sm leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Want us in the room?</span> A premium
          live-service option with in-room recording via a Fieldy device is available by
          conversation: {formatCad(PLAN_A_NOTE.monthly)} CAD/month (
          {formatCad(PLAN_A_NOTE.monthlyOwnDevice)} if you already own a Fieldy) plus a one-time{" "}
          {formatCad(PLAN_A_NOTE.setup)} guided setup. Most boards start on the standard plan above.{" "}
          <a
            href={BOOKING_URL}
            className="inline-flex items-center font-medium text-primary underline-offset-4 hover:underline"
            data-touch-target
          >
            Talk to us
          </a>
        </p>
      </div>
    </section>
  );
}

function ValueBlocks() {
  return (
    <section className="border-t border-border bg-card">
      <div className="mx-auto max-w-4xl px-4 py-16">
        <h2 className="font-serif text-2xl font-semibold">Why boards choose QiMiiTiNG</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {VALUE_BLOCKS.map((block) => (
            <div key={block.title} className="rounded-xl border border-border bg-background p-5">
              <h3 className="font-serif text-lg font-semibold">{block.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{block.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingFaq() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="font-serif text-2xl font-semibold">FAQ</h2>
        <Accordion type="single" collapsible className="mt-6">
          {FAQ.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="border-t border-border bg-card">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h2 className="font-serif text-3xl font-semibold">See your next meeting run end to end</h2>
        <p className="mt-3 text-muted-foreground">20 minutes, your questions, no pressure.</p>
        <div className="mt-8">
          <Button asChild size="lg">
            <a href={BOOKING_URL} data-touch-target>
              Book a walkthrough
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
