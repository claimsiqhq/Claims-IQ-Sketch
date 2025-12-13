import { useStore } from "@/lib/store";
import Layout from "@/components/layout";
import ClaimCard from "@/components/claim-card";
import { Button } from "@/components/ui/button";
import { Plus, BarChart3, Clock, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const claims = useStore((state) => state.claims);
  const user = useStore((state) => state.user);

  const stats = {
    open: claims.filter(c => c.status === 'open').length,
    review: claims.filter(c => c.status === 'review').length,
    closed: claims.filter(c => c.status === 'closed').length
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-6 md:p-8">
        
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500 mt-1">Welcome back, {user.name}. You have {stats.open} active claims.</p>
          </div>
          <Link href="/new-claim">
            <Button size="lg" className="shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-5 w-5" />
              New Claim
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center text-primary">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">In Progress</p>
              <p className="text-3xl font-display font-bold text-slate-900">{stats.open}</p>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
              <p className="text-3xl font-display font-bold text-slate-900">{stats.review}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Completed Today</p>
              <p className="text-3xl font-display font-bold text-slate-900">{stats.closed}</p>
            </div>
          </div>
        </div>

        {/* Claims List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-semibold text-slate-900">Recent Claims</h2>
            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
              View All
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {claims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}
