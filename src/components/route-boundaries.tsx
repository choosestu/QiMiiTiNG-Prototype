import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function RouteErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h2 className="font-serif text-xl">Something went wrong loading this page.</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message || "Unexpected error."}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Try again
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

export function RouteNotFoundComponent() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h2 className="font-serif text-xl">Not found.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn't find what you were looking for.
      </p>
      <div className="mt-4">
        <Button size="sm" variant="outline" asChild>
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
