import { Badge } from "@/components/ui/badge";

export const ROLE_EMAIL_DOMAIN = "ofla.ca";

export type PortalStatus = "invitation_pending" | "active" | "revoked";

export type PositionCategory =
  | "elected_officer"
  | "appointed_officer"
  | "director_at_large"
  | "ex_officio"
  | "custom";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const STATUS_LABEL: Record<PortalStatus, string> = {
  invitation_pending: "Invitation pending",
  active: "Portal active",
  revoked: "Portal closed",
};

export function PortalStatusBadge({ status }: { status?: PortalStatus | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="shrink-0 font-normal">
        Vacant
      </Badge>
    );
  }
  return (
    <Badge variant={status === "active" ? "default" : "secondary"} className="shrink-0 font-normal">
      {STATUS_LABEL[status]}
    </Badge>
  );
}
