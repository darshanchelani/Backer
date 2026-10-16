import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound } from "lucide-react";

/**
 * Shown when an external service hasn't been configured yet.
 * The whole app is designed to boot with zero keys; this makes
 * "what do I do next" obvious instead of mysterious.
 */
export function SetupNotice({
  feature,
  envVars,
  steps,
}: {
  feature: string;
  envVars: string[];
  steps: string[];
}) {
  return (
    <Card className="max-w-lg w-full">
      <CardHeader>
        <div className="flex items-center gap-2 text-muted-foreground">
          <KeyRound className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">Setup needed</span>
        </div>
        <CardTitle className="text-xl">{feature} isn&apos;t configured yet</CardTitle>
        <CardDescription>
          Backer runs without external accounts - but this feature needs one. Add the keys below to{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> and restart the dev server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <div className="rounded-md bg-muted p-3 font-mono text-xs">
          {envVars.map((v) => (
            <div key={v}>{v}=</div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
