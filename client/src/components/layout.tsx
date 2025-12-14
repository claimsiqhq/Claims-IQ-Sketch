import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  PlusCircle,
  Bell,
  Mic,
  User,
  ChevronDown,
  Building2,
  Check,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import logoWordmark from "../assets/logo-wordmark.png";
import { getMyOrganizations, switchOrganization, type Organization } from "@/lib/api";

// Default avatar for authenticated users
const DEFAULT_AVATAR = "https://api.dicebear.com/7.x/initials/svg?seed=Admin";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const user = useStore((state) => state.user);
  const authUser = useStore((state) => state.authUser);
  const logout = useStore((state) => state.logout);

  // Organization state
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [switchingOrg, setSwitchingOrg] = useState(false);

  // Load organizations on mount
  useEffect(() => {
    async function loadOrganizations() {
      try {
        const result = await getMyOrganizations();
        setOrganizations(result.organizations);
        setCurrentOrgId(result.currentOrganizationId || null);
      } catch (err) {
        console.error('Failed to load organizations:', err);
      } finally {
        setLoadingOrgs(false);
      }
    }
    if (authUser) {
      loadOrganizations();
    } else {
      setLoadingOrgs(false);
    }
  }, [authUser]);

  // Handle organization switch
  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === currentOrgId || switchingOrg) return;

    setSwitchingOrg(true);
    try {
      await switchOrganization(orgId);
      setCurrentOrgId(orgId);
      // Reload the page to reflect the new organization context
      window.location.reload();
    } catch (err) {
      console.error('Failed to switch organization:', err);
    } finally {
      setSwitchingOrg(false);
    }
  };

  const currentOrg = organizations.find(o => o.id === currentOrgId);

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/" },
    { label: "New Claim", icon: PlusCircle, href: "/new-claim" },
    { label: "Voice Sketch", icon: Mic, href: "/voice-sketch" },
    { label: "Admin Settings", icon: Settings, href: "/settings" },
  ];

  const handleLogout = async () => {
    await logout();
    setLocation("/auth");
  };

  // Get display name and avatar
  const displayName = authUser?.username || user.name;
  const displayAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-white border-b border-border h-16 flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
          <img src={logoWordmark} alt="Claims IQ" className="h-8 w-auto" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full p-0 h-8 w-8">
                <img
                  src={displayAvatar}
                  alt={displayName}
                  className="h-8 w-8 rounded-full border border-border"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setLocation("/profile")}
              >
                <User className="mr-2 h-4 w-4" />
                <span>My Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive cursor-pointer"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Sidebar Navigation (Desktop) */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-border transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:h-screen md:sticky md:top-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="h-16 flex items-center px-6 border-b border-border">
            <img src={logoWordmark} alt="Claims IQ" className="h-9 w-auto" />
          </div>

          <div className="p-4">
            {/* Organization Switcher */}
            {organizations.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 p-3 mb-4 bg-primary/5 border border-primary/20 rounded-lg w-full hover:bg-primary/10 transition-colors cursor-pointer">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="overflow-hidden flex-1 text-left">
                      <p className="font-medium text-sm truncate">
                        {loadingOrgs ? 'Loading...' : (currentOrg?.name || 'Select Organization')}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {currentOrg?.type || 'No organization'}
                      </p>
                    </div>
                    {switchingOrg ? (
                      <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {organizations.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      className="cursor-pointer"
                      onClick={() => handleSwitchOrg(org.id)}
                    >
                      <Building2 className="mr-2 h-4 w-4" />
                      <span className="flex-1 truncate">{org.name}</span>
                      {org.id === currentOrgId && (
                        <Check className="ml-2 h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* User Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 p-3 mb-6 bg-muted/50 rounded-lg w-full hover:bg-muted transition-colors cursor-pointer">
                  <img
                    src={displayAvatar}
                    alt={displayName}
                    className="h-10 w-10 rounded-full border border-white shadow-sm"
                  />
                  <div className="overflow-hidden flex-1 text-left">
                    <p className="font-medium text-sm truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {authUser ? 'Administrator' : user.email}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setIsMobileMenuOpen(false)}>
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer min-tap-target",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted"
                    )}>
                      <item.icon className={cn("h-5 w-5", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto p-4 border-t border-border">
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5 mr-3" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto h-[calc(100vh-64px)] md:h-screen w-full scroll-smooth-touch">
        {children}
      </main>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
