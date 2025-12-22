import { Link } from "wouter";
import { MapPin, Calendar, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Claim } from "@/lib/types";

interface ClaimCardProps {
  claim: Claim;
}

export default function ClaimCard({ claim }: ClaimCardProps) {
  const statusColors: Record<string, string> = {
    fnol: "bg-purple-100 text-purple-700 hover:bg-purple-100/80",
    draft: "bg-slate-100 text-slate-700 hover:bg-slate-100/80",
    open: "bg-blue-100 text-blue-700 hover:bg-blue-100/80",
    in_progress: "bg-cyan-100 text-cyan-700 hover:bg-cyan-100/80",
    review: "bg-amber-100 text-amber-700 hover:bg-amber-100/80",
    approved: "bg-green-100 text-green-700 hover:bg-green-100/80",
    closed: "bg-gray-100 text-gray-700 hover:bg-gray-100/80",
  };

  // Parse date from format "MM/DD/YYYY@HH:MM AM/PM"
  const formatDateOfLoss = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    // Extract just the date portion before @
    const datePart = dateStr.split('@')[0];
    if (!datePart) return dateStr;
    return datePart;
  };

  return (
    <Link href={`/claim/${claim.id}`}>
      <Card className="hover:shadow-md active:shadow-sm transition-shadow cursor-pointer group border-l-4 border-l-transparent hover:border-l-primary active:border-l-primary active:scale-[0.99]">
        <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-display font-semibold text-lg group-hover:text-primary transition-colors">
                {claim.policyholder || 'Unknown Policyholder'}
              </span>
              <Badge variant="secondary" className={statusColors[claim.status] || statusColors.draft}>
                {claim.status.toUpperCase().replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              {claim.claimId} {claim.policyNumber && `• ${claim.policyNumber}`}
            </p>
          </div>
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
            <ChevronRight className="h-5 w-5" />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {(claim.propertyAddress || claim.riskLocation) && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground mb-2">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{claim.propertyAddress || claim.riskLocation}</span>
            </div>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-4">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>Loss: {formatDateOfLoss(claim.dateOfLoss)}</span>
            </div>
            {claim.causeOfLoss && (
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary/50" />
                <span>{claim.causeOfLoss}</span>
              </div>
            )}
            {claim.dwellingLimit && (
              <div className="flex items-center gap-1">
                <span className="text-green-600 font-medium">{claim.dwellingLimit}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
