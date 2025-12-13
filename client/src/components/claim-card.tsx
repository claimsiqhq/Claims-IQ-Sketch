import { Link } from "wouter";
import { format } from "date-fns";
import { MapPin, Calendar, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Claim } from "@/lib/types";

interface ClaimCardProps {
  claim: Claim;
}

export default function ClaimCard({ claim }: ClaimCardProps) {
  const statusColors = {
    draft: "bg-slate-100 text-slate-700 hover:bg-slate-100/80",
    open: "bg-blue-100 text-blue-700 hover:bg-blue-100/80",
    review: "bg-amber-100 text-amber-700 hover:bg-amber-100/80",
    approved: "bg-green-100 text-green-700 hover:bg-green-100/80",
    closed: "bg-gray-100 text-gray-700 hover:bg-gray-100/80",
  };

  return (
    <Link href={`/claim/${claim.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer group border-l-4 border-l-transparent hover:border-l-primary">
        <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between space-y-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-display font-semibold text-lg group-hover:text-primary transition-colors">
                {claim.customerName}
              </span>
              <Badge variant="secondary" className={statusColors[claim.status]}>
                {claim.status.toUpperCase()}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono">{claim.policyNumber}</p>
          </div>
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
            <ChevronRight className="h-5 w-5" />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="flex items-start gap-2 text-sm text-muted-foreground mb-2">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {claim.address.street}, {claim.address.city}, {claim.address.state}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-4">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>Loss: {format(new Date(claim.dateOfLoss), "MMM d, yyyy")}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary/50" />
              <span>{claim.type}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
