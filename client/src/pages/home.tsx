import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  BarChart3,
  Clock,
  CheckCircle2,
  Search,
  FileText,
  MapPin,
  Calendar,
  DollarSign,
  Loader2,
  AlertCircle,
  Building2,
  Shield
} from "lucide-react";
import { Link } from "wouter";
import { getClaims, getClaimStats, type Claim, type ClaimStats } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

function ClaimCard({ claim }: { claim: Claim }) {
  const statusColors: Record<string, string> = {
    fnol: "bg-purple-100 text-purple-700",
    open: "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    review: "bg-orange-100 text-orange-700",
    approved: "bg-green-100 text-green-700",
    closed: "bg-slate-100 text-slate-700",
  };

  const lossTypeIcons: Record<string, string> = {
    Water: "💧",
    Fire: "🔥",
    "Wind/Hail": "💨",
    Impact: "💥",
    Other: "📋",
  };

  return (
    <Link href={`/claim/${claim.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{lossTypeIcons[claim.lossType || "Other"] || "📋"}</span>
                <span className="font-semibold text-slate-900">{claim.claimNumber}</span>
              </div>
              <p className="text-sm text-slate-600">{claim.insuredName || "Unknown Insured"}</p>
            </div>
            <Badge className={statusColors[claim.status] || statusColors.fnol}>
              {claim.status.replace("_", " ").toUpperCase()}
            </Badge>
          </div>

          <div className="space-y-2 text-sm text-slate-500">
            {claim.propertyAddress && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span className="truncate">
                  {claim.propertyAddress}
                  {claim.propertyCity && `, ${claim.propertyCity}`}
                  {claim.propertyState && `, ${claim.propertyState}`}
                </span>
              </div>
            )}
            {claim.dateOfLoss && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Loss: {new Date(claim.dateOfLoss).toLocaleDateString()}</span>
              </div>
            )}
            {claim.totalRcv && parseFloat(claim.totalRcv) > 0 && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                <span>RCV: ${parseFloat(claim.totalRcv).toLocaleString()}</span>
              </div>
            )}
            {claim.coverageA && (
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>
                  Coverage A: {Number.isFinite(Number(claim.coverageA)) 
                    ? `$${Number(claim.coverageA).toLocaleString()}` 
                    : "—"}
                </span>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-slate-400">
            <span>
              {claim.documentCount || 0} docs • {claim.estimateCount || 0} estimates
            </span>
            <span>
              {formatDistanceToNow(new Date(claim.createdAt), { addSuffix: true })}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Home() {
  const user = useStore((state) => state.user);
  const authUser = useStore((state) => state.authUser);

  const [claims, setClaims] = useState<Claim[]>([]);
  const [stats, setStats] = useState<ClaimStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [claimsResult, statsResult] = await Promise.all([
        getClaims({
          status: statusFilter !== "all" ? statusFilter : undefined,
          search: searchQuery || undefined,
          limit: 20,
        }),
        getClaimStats(),
      ]);

      setClaims(claimsResult.claims);
      setStats(statsResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const displayName = authUser?.username || user.name;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-6 md:p-8">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500 mt-1">
              Welcome back, {displayName}.
              {stats && ` You have ${stats.byStatus.open || 0} active claims.`}
            </p>
          </div>
          <Link href="/new-claim">
            <Button size="lg" className="shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-5 w-5" />
              New Claim
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">FNOL</p>
              <p className="text-3xl font-display font-bold text-slate-900">
                {stats?.byStatus.fnol || 0}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center text-primary">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">In Progress</p>
              <p className="text-3xl font-display font-bold text-slate-900">
                {(stats?.byStatus.open || 0) + (stats?.byStatus.in_progress || 0)}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">In Review</p>
              <p className="text-3xl font-display font-bold text-slate-900">
                {stats?.byStatus.review || 0}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Closed</p>
              <p className="text-3xl font-display font-bold text-slate-900">
                {stats?.byStatus.closed || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Total Value Card */}
        {stats && (stats.totalRcv > 0 || stats.totalAcv > 0) && (
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 p-6 rounded-xl border border-primary/20 mb-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center text-primary">
                <DollarSign className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-600">Total Claims Value</p>
                <div className="flex items-baseline gap-4 mt-1">
                  <div>
                    <span className="text-2xl font-display font-bold text-slate-900">
                      ${stats.totalRcv.toLocaleString()}
                    </span>
                    <span className="text-sm text-slate-500 ml-1">RCV</span>
                  </div>
                  <div>
                    <span className="text-xl font-display font-semibold text-slate-700">
                      ${stats.totalAcv.toLocaleString()}
                    </span>
                    <span className="text-sm text-slate-500 ml-1">ACV</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search claims..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="fnol">FNOL</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="review">In Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Claims List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-semibold text-slate-900">
              Claims
              {claims.length > 0 && (
                <span className="text-sm font-normal text-slate-500 ml-2">
                  ({claims.length} shown)
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to load claims</h3>
              <p className="text-slate-500 mb-4">{error}</p>
              <Button onClick={loadData}>Try Again</Button>
            </div>
          ) : claims.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No claims yet</h3>
              <p className="text-slate-500 mb-4">
                Get started by uploading your first FNOL document
              </p>
              <Link href="/new-claim">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Claim
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {claims.map((claim) => (
                <ClaimCard key={claim.id} claim={claim} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
