import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        No record at this address.
      </h1>
      <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
        The page you requested does not exist in the registry.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-6">
        <Link to="/" className="text-xs">
          Return to the graph
        </Link>
      </Button>
    </div>
  );
}
