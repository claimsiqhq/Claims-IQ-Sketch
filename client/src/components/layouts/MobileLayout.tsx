import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  PlusCircle,
  Mic,
  Settings,
  User,
  LogOut,
  Bell,
  ChevronDown,
  Building2,
  Check,
  Loader2,
  Menu,
  X
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import logoWordmark from "@/assets/logo-wordmark.png";
import { getMyOrganizations, switchOrganization, type Organization } from "@/lib/api";

// Navigation items for bottom bar - focused on core mobile actions
const bottomNavItems = [
  { label: "Home", icon: LayoutDashboard, href: "/" },
  { label: "New", icon: PlusCircle, href: "/new-claim" },
  { label: "Voice", icon: Mic, href: "/voice-sketch" },
  { label: "More", icon: Menu, href: "#more" }, // Opens sheet
];

interface MobileLayoutProps {
  children: React.ReactNode;
  hideNav?: boolean; // For full-screen modes like sketch canvas
}

export default function MobileLayout({ children, hideNav = false }: MobileLayoutProps) {
  const [location, setLocation] = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
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
      window.location.reload();
    } catch (err) {
      console.error('Failed to switch organization:', err);
    } finally {
      setSwitchingOrg(false);
    }
  };

  const currentOrg = organizations.find(o => o.id === currentOrgId);

  const handleLogout = async () => {
    await logout();
    setLocation("/auth");
  };

  const displayName = authUser?.username || user.name;
  const displayAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;

  // Check if current route should be highlighted
  const isActiveRoute = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <div className="min-h-dvh bg-muted/30 flex flex-col">
      {/* Mobile Header - Minimal */}
      <header className="bg-white border-b border-border h-14 flex items-center justify-between px-4 sticky top-0 z-50 pt-safe">
        <div className="flex items-center gap-2">
          <img src={logoWordmark} alt="Claims IQ" className="h-7 w-auto" />
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full p-0 h-9 w-9">
                <img
                  src={displayAvatar}
                  alt={displayName}
                  className="h-8 w-8 rounded-full border border-border"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* Organization Switcher in dropdown */}
              {organizations.length > 1 && (
                <>
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Organization
                  </DropdownMenuLabel>
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
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setLocation("/settings?tab=profile")}
              >
                <User className="mr-2 h-4 w-4" />
                <span>My Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setLocation("/settings")}
              >
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
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
        </div>
      </header>

      {/* Main Content */}
      <main className={cn(
        "flex-1 overflow-auto scroll-smooth-touch",
        !hideNav && "pb-20" // Add padding for bottom nav
      )}>
        {children}
      </main>

      {/* Bottom Navigation Bar */}
      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50 pb-safe">
          <div className="flex items-center justify-around h-16">
            {bottomNavItems.map((item) => {
              // Handle "More" button specially
              if (item.href === "#more") {
                return (
                  <Sheet key="more" open={isMoreOpen} onOpenChange={setIsMoreOpen}>
                    <SheetTrigger asChild>
                      <button className="flex flex-col items-center justify-center gap-1 min-w-[64px] py-2 text-muted-foreground active:bg-muted rounded-lg transition-colors min-tap-target">
                        <item.icon className="h-5 w-5" />
                        <span className="text-xs font-medium">{item.label}</span>
                      </button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="pb-safe">
                      <SheetHeader>
                        <SheetTitle>More Options</SheetTitle>
                      </SheetHeader>
                      <div className="grid gap-2 py-4">
                        {/* Current Organization */}
                        {currentOrg && (
                          <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg mb-2">
                            <Building2 className="h-5 w-5 text-primary" />
                            <div className="flex-1">
                              <p className="font-medium text-sm">{currentOrg.name}</p>
                              <p className="text-xs text-muted-foreground">{currentOrg.type}</p>
                            </div>
                          </div>
                        )}

                        <Link href="/settings" onClick={() => setIsMoreOpen(false)}>
                          <div className="flex items-center gap-3 p-3 hover:bg-muted rounded-lg transition-colors min-tap-target">
                            <Settings className="h-5 w-5 text-muted-foreground" />
                            <span className="font-medium">Settings</span>
                          </div>
                        </Link>

                        <Link href="/settings?tab=profile" onClick={() => setIsMoreOpen(false)}>
                          <div className="flex items-center gap-3 p-3 hover:bg-muted rounded-lg transition-colors min-tap-target">
                            <User className="h-5 w-5 text-muted-foreground" />
                            <span className="font-medium">My Profile</span>
                          </div>
                        </Link>

                        <button
                          className="flex items-center gap-3 p-3 hover:bg-destructive/10 rounded-lg transition-colors text-destructive w-full min-tap-target"
                          onClick={handleLogout}
                        >
                          <LogOut className="h-5 w-5" />
                          <span className="font-medium">Sign Out</span>
                        </button>
                      </div>
                    </SheetContent>
                  </Sheet>
                );
              }

              const isActive = isActiveRoute(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex flex-col items-center justify-center gap-1 min-w-[64px] py-2 rounded-lg transition-colors min-tap-target",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground active:bg-muted"
                  )}>
                    <item.icon className={cn(
                      "h-5 w-5",
                      isActive && "fill-primary/20"
                    )} />
                    <span className={cn(
                      "text-xs font-medium",
                      isActive && "font-semibold"
                    )}>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
