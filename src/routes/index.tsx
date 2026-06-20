import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "QiMiiTiNG — Meeting automation for volunteer organizations" },
      {
        name: "description",
        content:
          "Officer reports, agendas, motions, transcripts, and AI-drafted minutes — built for volunteer boards.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  "Officer report collection with reminders",
  "AI-generated agendas grounded in Robert's Rules",
  "Verbatim motion recording with vote tallies",
  "Optional Fieldy transcription per meeting",
  "Secretary-approved AI minutes, full audit log",
  "Saved directly to your Google Drive",
];

function Landing() {
  return (
    <main className="bg-background">
      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:py-28">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          QiMiiTiNG · Phase 1
        </p>
        <h1 className="mt-4 font-serif text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
          Meeting automation for volunteer organizations
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Run your board the way Robert's Rules intended — without the paperwork.
          QiMiiTiNG handles reports, agendas, motions, transcripts and minutes,
          end to end.
        </p>
        <div className="mt-10">
          <Button asChild size="lg">
            <Link to="/auth">
              Sign in <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-4xl px-4 py-16">
          <h2 className="font-serif text-2xl font-semibold">What's included</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
