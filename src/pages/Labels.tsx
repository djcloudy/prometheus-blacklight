import { useAppContext } from "@/lib/store";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, Copy, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";

const DYNAMIC_PATTERNS = ["url", "path", "uri", "id", "uuid", "uid", "session", "request_id", "pod", "pid", "container_id", "trace_id", "span_id"];

export default function Labels() {
  const { connection } = useAppContext();
  const tsdb = connection.tsdbStatus;
  const labels = tsdb?.labelValueCountByLabelName ?? [];

  const analyzed = useMemo(() => {
    return labels.map((l) => {
      const isDynamic = DYNAMIC_PATTERNS.some((p) => l.name.toLowerCase().includes(p));
      const isHighCardinality = l.value > 1000;
      const churnRisk = isDynamic ? (isHighCardinality ? "critical" : "high") : isHighCardinality ? "moderate" : "low";
      return { ...l, isDynamic, isHighCardinality, churnRisk };
    }).sort((a, b) => {
      const order = { critical: 0, high: 1, moderate: 2, low: 3 };
      return (order[a.churnRisk] ?? 3) - (order[b.churnRisk] ?? 3);
    });
  }, [labels]);

  if (!connection.isConnected) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GitBranch className="h-6 w-6 text-severity-churn" />
          Label Churn & Explosion
        </h1>
        <p className="text-muted-foreground text-sm">
          Detects dynamic and unbounded labels that cause series explosion.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatMini label="Total Labels" value={labels.length} />
        <StatMini label="Dynamic Pattern Matches" value={analyzed.filter((a) => a.isDynamic).length} color="text-severity-churn" />
        <StatMini label="High Cardinality" value={analyzed.filter((a) => a.isHighCardinality).length} color="text-severity-critical" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Label Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {analyzed.map((l) => (
              <LabelRow key={l.name} label={l} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LabelRow({ label }: { label: any }) {
  const [copied, setCopied] = useState(false);

  const yaml = `- action: labeldrop
  regex: "${label.name}"`;

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between text-sm py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="font-mono truncate">{label.name}</span>
        {label.isDynamic && (
          <Badge className="bg-severity-churn/15 text-severity-churn border-severity-churn/30 text-xs shrink-0">
            Dynamic
          </Badge>
        )}
        {label.isHighCardinality && (
          <Badge className="bg-severity-critical/15 text-severity-critical border-severity-critical/30 text-xs shrink-0">
            High Card
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono text-muted-foreground">{label.value.toLocaleString()} values</span>
        {(label.isDynamic || label.isHighCardinality) && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <span className="text-xs text-muted-foreground uppercase">{label}</span>
        <p className={`text-2xl font-bold font-mono ${color ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
