import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Settings,
  LogOut,
  PlusCircle,
  Mic,
  User,
  ChevronDown,
  Building2,
  Check,
  Loader2,
  FolderOpen,
  MapPin,
  Camera,
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
import logoWordmark from "@/assets/logo-wordmark.png";
import { useOrganization } from "@/hooks/useOrganization";

interface DesktopLayoutProps {
  children: React.ReactNode;
}

export default function DesktopLayout({ children }: DesktopLayoutProps) {
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const user = useStore((state) => state.user);
  const authUser = useStore((state) => state.authUser);
  const logout = useStore((state) => state.logout);

  // Organization state from shared hook
  const {
    organizations,
    currentOrgId,
    currentOrg,
    loadingOrgs,
    switchingOrg,
    handleSwitchOrg,
  } = useOrganization();

  const navItems = [
    { label: "All Claims", icon: FolderOpen, href: "/" },
    { label: "Photos", icon: Camera, href: "/photos" },
    { label: "Claims Map", icon: MapPin, href: "/map" },
    { label: "Voice Sketch", icon: Mic, href: "/voice-sketch" },
    { label: "Settings", icon: Settings, href: "/settings" },
  ];

  const handleLogout = async () => {
    await logout();
    setLocation("/auth");
  };

  const displayName = (() => {
    if (authUser?.firstName && authUser?.lastName) {
      return `${authUser.firstName} ${authUser.lastName}`.trim();
    }
    if (authUser?.firstName) {
      return authUser.firstName;
    }
    return authUser?.username || user?.name || 'User';
  })();
  const displayAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-row">
      {/* Skip to main content link for keyboard users */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Sidebar Navigation (Desktop) */}
      <aside
        className="fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-border h-screen sticky top-0"
        aria-label="Main navigation"
      >
        <div className="h-full flex flex-col">
          <div className="h-16 flex items-center px-6 border-b border-border">
            <img src={logoWordmark} alt="Claims IQ" className="h-9 w-auto" />
          </div>

          <div className="p-4">
            {/* Organization Switcher - always render container for stable layout */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={loadingOrgs || organizations.length === 0}>
                <button
                  className="flex items-center gap-3 p-3 mb-4 bg-primary/5 border border-primary/20 rounded-lg w-full hover:bg-primary/10 transition-colors cursor-pointer min-h-[64px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={loadingOrgs ? 'Loading organizations' : `Switch organization, current: ${currentOrg?.name || 'No Organization'}`}
                  aria-haspopup="menu"
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    {loadingOrgs ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Building2 className="h-5 w-5" />
                    )}
                  </div>
                  <div className="overflow-hidden flex-1 text-left">
                    <p className="font-medium text-sm truncate">
                      {loadingOrgs ? 'Loading...' : (currentOrg?.name || 'No Organization')}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {loadingOrgs ? 'Please wait' : (currentOrg?.type || 'Not assigned')}
                    </p>
                  </div>
                  {switchingOrg ? (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                  ) : organizations.length > 0 ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : null}
                </button>
              </DropdownMenuTrigger>
              {organizations.length > 0 && (
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
              )}
            </DropdownMenu>

            {/* User Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-3 p-3 mb-6 bg-muted/50 rounded-lg w-full hover:bg-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`User menu for ${displayName}`}
                  aria-haspopup="menu"
                >
                  <img
                    src={displayAvatar}
                    alt={displayName}
                    className="h-10 w-10 rounded-full border border-white shadow-sm"
                  />
                  <div className="overflow-hidden flex-1 text-left">
                    <p className="font-medium text-sm truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {authUser ? 'Administrator' : user?.email || 'No email'}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => setLocation("/settings?tab=profile")}
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

            <nav className="space-y-1" aria-label="Primary navigation">
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
      <main id="main-content" className="flex-1 overflow-auto h-screen w-full" role="main" aria-label="Main content">
        {children}
      </main>
    </div>
  );
}
