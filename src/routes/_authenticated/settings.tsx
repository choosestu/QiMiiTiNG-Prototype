import { createFileRoute, Outlet } from "@tanstack/react-router";

import { RouteErrorComponent, RouteNotFoundComponent } from "@/components/route-boundaries";

// Layout route for /settings and its children (e.g. /settings/allowlist).
// Must render <Outlet/> so nested routes display; the /settings page itself
// lives in settings.index.tsx.
export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});

function SettingsLayout() {
  return <Outlet />;
}
