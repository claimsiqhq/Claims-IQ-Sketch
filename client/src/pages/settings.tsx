import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw,
  Database,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Settings as SettingsIcon,
  DollarSign,
  Server,
  Activity,
  Globe,
  Package,
  FileText,
  MapPin,
  TrendingUp,
  Calculator,
  Building2,
  Bell,
  Mail,
  MessageSquare,
  Percent,
  Save,
  User,
  Lock,
  Trash2,
  AlertTriangle,
  Image,
  FolderOpen,
  Calendar,
  Link2,
  Unlink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/lib/store";
import { 
  getUserPreferences, 
  saveUserPreferences, 
  updateUserProfile,
  getMs365ConnectionStatus,
  connectMs365,
  disconnectMs365,
  syncCalendarFromMs365,
  syncCalendarToMs365,
  syncCalendarFull,
  getCalendarSyncStatus,
  type CalendarSyncStatus,
  type CalendarSyncResult
} from "@/lib/api";

interface ScrapeJobResult {
  jobId: string;
  status: string;
  itemsProcessed: number;
  itemsUpdated: number;
}

interface ScraperConfig {
  productMappings: Record<string, {
    search: string;
    filters: Record<string, string[]>;
    unit: string;
  }>;
  storeRegions: Record<string, string>;
}

interface ScrapedPrice {
  sku: string;
  material_name: string;
  unit: string;
  region_id: string;
  price: string;
  source: string;
  effective_date: string;
}

interface ScrapeJob {
  id: string;
  source: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number;
  items_updated: number;
  errors: any[];
}

interface SystemStatus {
  database: {
    connected: boolean;
    time?: string;
    version?: string;
    error?: string;
  };
  counts?: {
    claims: number;
    estimates: number;
    lineItems: number;
    priceLists: number;
    regions: number;
  };
  regions?: { id: string; name: string }[];
  environment: string;
  openaiConfigured: boolean;
}

interface EstimateDefaults {
  laborMultiplier: number;
  materialMultiplier: number;
  overheadPercent: number;
  profitPercent: number;
  defaultRegion: string;
  includeTax: boolean;
  taxRate: number;
  roundToNearest: string;
}

interface NotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailNewClaim: boolean;
  emailClaimApproved: boolean;
  emailClaimDenied: boolean;
  smsUrgentAlerts: boolean;
  digestFrequency: string;
}

export default function Settings() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const tabFromUrl = searchParams.get('tab');
  
  const authUser = useStore((state) => state.authUser);
  const user = useStore((state) => state.user);
  const updateAuthUser = useStore((state) => state.updateAuthUser);
  
  const displayName = [authUser?.firstName, authUser?.lastName].filter(Boolean).join(' ') || authUser?.username || user?.name || 'User';
  const displayEmail = authUser?.email || user?.email || '';
  const displayAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;

  const [activeTab, setActiveTab] = useState(tabFromUrl || "profile");
  const [isScrapingHomeDepot, setIsScrapingHomeDepot] = useState(false);
  const [lastScrapeResult, setLastScrapeResult] = useState<ScrapeJobResult | null>(null);
  const [scraperConfig, setScraperConfig] = useState<ScraperConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [scrapedPrices, setScrapedPrices] = useState<ScrapedPrice[]>([]);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isLoadingSystem, setIsLoadingSystem] = useState(false);
  
  const [profileData, setProfileData] = useState({
    displayName: displayName,
    email: displayEmail,
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [estimateDefaults, setEstimateDefaults] = useState<EstimateDefaults>({
    laborMultiplier: 1.0,
    materialMultiplier: 1.0,
    overheadPercent: 10,
    profitPercent: 10,
    defaultRegion: "US-TX-DAL",
    includeTax: true,
    taxRate: 8.25,
    roundToNearest: "0.01"
  });

  const [notifications, setNotifications] = useState<NotificationPreferences>({
    emailEnabled: true,
    smsEnabled: false,
    emailNewClaim: true,
    emailClaimApproved: true,
    emailClaimDenied: true,
    smsUrgentAlerts: false,
    digestFrequency: "daily"
  });

  const [defaultCarrier, setDefaultCarrier] = useState("state-farm");
  const [approvalThreshold, setApprovalThreshold] = useState(10000);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [isPurgingClaims, setIsPurgingClaims] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  useEffect(() => {
    setProfileData(prev => ({
      ...prev,
      displayName: displayName,
      email: displayEmail,
    }));
  }, [displayName, displayEmail]);

  const runHomeDepotScraper = async () => {
    setIsScrapingHomeDepot(true);
    try {
      const response = await fetch('/api/scrape/home-depot', { method: 'POST', credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to run scraper');
      }
      const result = await response.json();
      setLastScrapeResult(result);
      toast({
        title: "Scrape Complete",
        description: `Processed ${result.itemsProcessed} items, updated ${result.itemsUpdated} prices.`,
      });
    } catch (error) {
      toast({
        title: "Scrape Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsScrapingHomeDepot(false);
    }
  };

  const loadScraperConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const response = await fetch('/api/scrape/config', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load config');
      const config = await response.json();
      setScraperConfig(config);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load scraper configuration",
        variant: "destructive",
      });
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const loadScrapedPrices = async () => {
    setIsLoadingPrices(true);
    try {
      const [pricesRes, jobsRes] = await Promise.all([
        fetch('/api/scrape/prices', { credentials: 'include' }),
        fetch('/api/scrape/jobs', { credentials: 'include' })
      ]);
      if (pricesRes.ok) {
        const prices = await pricesRes.json();
        setScrapedPrices(prices);
      }
      if (jobsRes.ok) {
        const jobs = await jobsRes.json();
        setScrapeJobs(jobs);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load scraped prices",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPrices(false);
    }
  };

  const loadSystemStatus = async () => {
    setIsLoadingSystem(true);
    try {
      const response = await fetch('/api/system/status', { credentials: 'include' });
      if (response.ok) {
        const status = await response.json();
        setSystemStatus(status);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load system status",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSystem(false);
    }
  };

  useEffect(() => {
    loadSystemStatus();
    loadUserPreferences();
  }, []);

  const loadUserPreferences = async () => {
    setIsLoadingPreferences(true);
    try {
      const prefs = await getUserPreferences();
      if (prefs.estimateDefaults) {
        setEstimateDefaults(prev => ({ ...prev, ...prefs.estimateDefaults }));
      }
      if (prefs.notifications) {
        setNotifications(prev => ({ ...prev, ...prefs.notifications }));
      }
      if (prefs.carrier) {
        setDefaultCarrier(prefs.carrier.defaultCarrier || "state-farm");
        setApprovalThreshold(prefs.carrier.approvalThreshold || 10000);
      }
    } catch (error) {
      // Failed to load preferences - will show error state
    } finally {
      setIsLoadingPreferences(false);
    }
  };

  const groupedPrices = scrapedPrices.reduce((acc, price) => {
    if (!acc[price.sku]) {
      acc[price.sku] = {
        sku: price.sku,
        name: price.material_name,
        unit: price.unit,
        regions: {}
      };
    }
    acc[price.sku].regions[price.region_id] = {
      price: parseFloat(price.price),
      date: price.effective_date
    };
    return acc;
  }, {} as Record<string, { sku: string; name: string; unit: string; regions: Record<string, { price: number; date: string }> }>);

  const handleSaveEstimateDefaults = async () => {
    setIsSavingPreferences(true);
    try {
      await saveUserPreferences({ estimateDefaults });
      toast({
        title: "Settings Saved",
        description: "Estimate defaults have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleSaveCarrierSettings = async () => {
    setIsSavingPreferences(true);
    try {
      await saveUserPreferences({ 
        carrier: { defaultCarrier, approvalThreshold } 
      });
      toast({
        title: "Settings Saved",
        description: "Carrier settings have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleSaveNotifications = async () => {
    setIsSavingPreferences(true);
    try {
      await saveUserPreferences({ notifications });
      toast({
        title: "Settings Saved",
        description: "Notification preferences have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPreferences(true);
    try {
      const result = await updateUserProfile({
        displayName: profileData.displayName,
        email: profileData.email,
      });
      if (result.user) {
        updateAuthUser({
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          email: result.user.email,
        });
      }
      toast({
        title: "Profile Saved",
        description: result.message || "Your profile has been updated.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save profile",
        variant: "destructive",
      });
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileData.newPassword !== profileData.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive",
      });
      return;
    }
    if (profileData.newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }
    // Password change API not yet implemented
    toast({
      title: "Coming Soon",
      description: "Password change functionality will be available in a future update.",
    });
    setProfileData(prev => ({ ...prev, currentPassword: "", newPassword: "", confirmPassword: "" }));
  };

  const handlePurgeAllClaims = async () => {
    setIsPurgingClaims(true);
    try {
      const response = await fetch('/api/claims/purge-all', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to purge claims');
      }
      const result = await response.json();
      toast({
        title: "Claims Purged",
        description: result.message || `Deleted ${result.claimsDeleted} claims and ${result.relatedRecordsDeleted} related records`,
      });
      setShowPurgeConfirm(false);
    } catch (error) {
      toast({
        title: "Purge Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsPurgingClaims(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setLocation(`/settings?tab=${value}`, { replace: true });
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight font-display" data-testid="text-page-title">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your estimate defaults, carriers, and preferences</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
            <TabsTrigger value="profile" data-testid="tab-profile" className="gap-2">
              <User className="h-4 w-4 hidden sm:block" />
              <span>Profile</span>
            </TabsTrigger>
            <TabsTrigger value="estimates" data-testid="tab-estimates" className="gap-2">
              <Calculator className="h-4 w-4 hidden sm:block" />
              <span>Estimates</span>
            </TabsTrigger>
            <TabsTrigger value="carriers" data-testid="tab-carriers" className="gap-2">
              <Building2 className="h-4 w-4 hidden sm:block" />
              <span>Carriers</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" data-testid="tab-notifications" className="gap-2">
              <Bell className="h-4 w-4 hidden sm:block" />
              <span>Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="system" data-testid="tab-system" className="gap-2">
              <SettingsIcon className="h-4 w-4 hidden sm:block" />
              <span>System</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations" className="gap-2">
              <Link2 className="h-4 w-4 hidden sm:block" />
              <span>Integrations</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile & Account Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={displayAvatar} alt={displayName} />
                    <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle>{displayName}</CardTitle>
                    <CardDescription>{displayEmail}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="profileDisplayName">Display Name</Label>
                      <Input
                        id="profileDisplayName"
                        value={profileData.displayName}
                        onChange={(e) => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                        data-testid="input-display-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profileEmail">Email Address</Label>
                      <Input
                        id="profileEmail"
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                        data-testid="input-email"
                      />
                    </div>
                  </div>
                  <Button type="submit" data-testid="button-save-profile">
                    <Save className="h-4 w-4 mr-2" />
                    Save Profile
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Change Password
                </CardTitle>
                <CardDescription>Update your password for security</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={profileData.currentPassword}
                      onChange={(e) => setProfileData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="max-w-sm"
                      data-testid="input-current-password"
                    />
                  </div>
                  <Separator />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={profileData.newPassword}
                        onChange={(e) => setProfileData(prev => ({ ...prev, newPassword: e.target.value }))}
                        data-testid="input-new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={profileData.confirmPassword}
                        onChange={(e) => setProfileData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        data-testid="input-confirm-password"
                      />
                    </div>
                  </div>
                  <Button type="submit" variant="outline" data-testid="button-change-password">
                    <Lock className="h-4 w-4 mr-2" />
                    Change Password
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Estimate Defaults Tab */}
          <TabsContent value="estimates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5" />
                  Pricing Multipliers
                </CardTitle>
                <CardDescription>
                  Set default multipliers applied to labor and material costs on new estimates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="laborMultiplier">Labor Rate Multiplier</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        id="laborMultiplier"
                        min={0.5}
                        max={2.0}
                        step={0.05}
                        value={[estimateDefaults.laborMultiplier]}
                        onValueChange={(value) => setEstimateDefaults(prev => ({ ...prev, laborMultiplier: value[0] }))}
                        className="flex-1"
                        data-testid="slider-labor-multiplier"
                      />
                      <span className="w-16 text-right font-mono text-sm">{estimateDefaults.laborMultiplier.toFixed(2)}x</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Adjust labor costs up or down from catalog rates</p>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="materialMultiplier">Material Cost Multiplier</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        id="materialMultiplier"
                        min={0.5}
                        max={2.0}
                        step={0.05}
                        value={[estimateDefaults.materialMultiplier]}
                        onValueChange={(value) => setEstimateDefaults(prev => ({ ...prev, materialMultiplier: value[0] }))}
                        className="flex-1"
                        data-testid="slider-material-multiplier"
                      />
                      <span className="w-16 text-right font-mono text-sm">{estimateDefaults.materialMultiplier.toFixed(2)}x</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Adjust material costs up or down from catalog rates</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Overhead & Profit (O&P)
                </CardTitle>
                <CardDescription>
                  Default overhead and profit percentages for estimates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="overheadPercent">Overhead Percentage</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        id="overheadPercent"
                        min={0}
                        max={25}
                        step={0.5}
                        value={[estimateDefaults.overheadPercent]}
                        onValueChange={(value) => setEstimateDefaults(prev => ({ ...prev, overheadPercent: value[0] }))}
                        className="flex-1"
                        data-testid="slider-overhead"
                      />
                      <span className="w-16 text-right font-mono text-sm">{estimateDefaults.overheadPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="profitPercent">Profit Percentage</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        id="profitPercent"
                        min={0}
                        max={25}
                        step={0.5}
                        value={[estimateDefaults.profitPercent]}
                        onValueChange={(value) => setEstimateDefaults(prev => ({ ...prev, profitPercent: value[0] }))}
                        className="flex-1"
                        data-testid="slider-profit"
                      />
                      <span className="w-16 text-right font-mono text-sm">{estimateDefaults.profitPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Combined O&P</span>
                    <span className="text-lg font-bold text-primary">
                      {(estimateDefaults.overheadPercent + estimateDefaults.profitPercent).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Regional & Tax Settings
                </CardTitle>
                <CardDescription>
                  Configure default region and tax handling for new estimates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="defaultRegion">Default Pricing Region</Label>
                    <Select
                      value={estimateDefaults.defaultRegion}
                      onValueChange={(value) => setEstimateDefaults(prev => ({ ...prev, defaultRegion: value }))}
                    >
                      <SelectTrigger id="defaultRegion" data-testid="select-default-region">
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US-TX-DAL">Dallas, TX</SelectItem>
                        <SelectItem value="US-CA-SF">San Francisco, CA</SelectItem>
                        <SelectItem value="US-FL-MIA">Miami, FL</SelectItem>
                        <SelectItem value="US-NY-NYC">New York, NY</SelectItem>
                        <SelectItem value="US-IL-CHI">Chicago, IL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="roundToNearest">Round Prices To</Label>
                    <Select
                      value={estimateDefaults.roundToNearest}
                      onValueChange={(value) => setEstimateDefaults(prev => ({ ...prev, roundToNearest: value }))}
                    >
                      <SelectTrigger id="roundToNearest" data-testid="select-rounding">
                        <SelectValue placeholder="Select rounding" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.01">Nearest cent ($0.01)</SelectItem>
                        <SelectItem value="0.05">Nearest 5 cents ($0.05)</SelectItem>
                        <SelectItem value="1.00">Nearest dollar ($1.00)</SelectItem>
                        <SelectItem value="5.00">Nearest $5.00</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="includeTax" className="text-base">Include Sales Tax</Label>
                    <p className="text-sm text-muted-foreground">Automatically calculate sales tax on materials</p>
                  </div>
                  <Switch
                    id="includeTax"
                    checked={estimateDefaults.includeTax}
                    onCheckedChange={(checked) => setEstimateDefaults(prev => ({ ...prev, includeTax: checked }))}
                    data-testid="switch-include-tax"
                  />
                </div>
                {estimateDefaults.includeTax && (
                  <div className="space-y-2">
                    <Label htmlFor="taxRate">Tax Rate (%)</Label>
                    <Input
                      id="taxRate"
                      type="number"
                      step="0.01"
                      value={estimateDefaults.taxRate}
                      onChange={(e) => setEstimateDefaults(prev => ({ ...prev, taxRate: parseFloat(e.target.value) || 0 }))}
                      className="max-w-32"
                      data-testid="input-tax-rate"
                    />
                  </div>
                )}
                <Button onClick={handleSaveEstimateDefaults} data-testid="button-save-estimates">
                  <Save className="h-4 w-4 mr-2" />
                  Save Estimate Defaults
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Carriers & Profiles Tab */}
          <TabsContent value="carriers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Default Carrier
                </CardTitle>
                <CardDescription>
                  Select the default insurance carrier for new claims and estimates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultCarrier">Primary Carrier</Label>
                  <Select value={defaultCarrier} onValueChange={setDefaultCarrier}>
                    <SelectTrigger id="defaultCarrier" data-testid="select-default-carrier">
                      <SelectValue placeholder="Select carrier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="state-farm">State Farm</SelectItem>
                      <SelectItem value="allstate">Allstate</SelectItem>
                      <SelectItem value="progressive">Progressive</SelectItem>
                      <SelectItem value="liberty-mutual">Liberty Mutual</SelectItem>
                      <SelectItem value="travelers">Travelers</SelectItem>
                      <SelectItem value="usaa">USAA</SelectItem>
                      <SelectItem value="nationwide">Nationwide</SelectItem>
                      <SelectItem value="farmers">Farmers Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Approval Thresholds
                </CardTitle>
                <CardDescription>
                  Set estimate value thresholds that require additional approval.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="approvalThreshold">Auto-Approval Limit</Label>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">$</span>
                    <Input
                      id="approvalThreshold"
                      type="number"
                      step="500"
                      value={approvalThreshold}
                      onChange={(e) => setApprovalThreshold(parseInt(e.target.value) || 0)}
                      className="max-w-40"
                      data-testid="input-approval-threshold"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Estimates above this amount will require manual carrier approval before processing.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm font-medium text-green-800">Auto-Approved</div>
                    <div className="text-xs text-green-600 mt-1">Under ${approvalThreshold.toLocaleString()}</div>
                  </div>
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="text-sm font-medium text-yellow-800">Review Required</div>
                    <div className="text-xs text-yellow-600 mt-1">${approvalThreshold.toLocaleString()} - ${(approvalThreshold * 2).toLocaleString()}</div>
                  </div>
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="text-sm font-medium text-red-800">Senior Approval</div>
                    <div className="text-xs text-red-600 mt-1">Over ${(approvalThreshold * 2).toLocaleString()}</div>
                  </div>
                </div>
                <Button onClick={handleSaveCarrierSettings} data-testid="button-save-carriers">
                  <Save className="h-4 w-4 mr-2" />
                  Save Carrier Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Notifications
                </CardTitle>
                <CardDescription>
                  Configure which events trigger email notifications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="emailEnabled" className="text-base">Enable Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive updates about your claims via email</p>
                  </div>
                  <Switch
                    id="emailEnabled"
                    checked={notifications.emailEnabled}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, emailEnabled: checked }))}
                    data-testid="switch-email-enabled"
                  />
                </div>
                {notifications.emailEnabled && (
                  <div className="space-y-3 pl-4 border-l-2 border-muted">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="emailNewClaim">New claim assigned to you</Label>
                      <Switch
                        id="emailNewClaim"
                        checked={notifications.emailNewClaim}
                        onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, emailNewClaim: checked }))}
                        data-testid="switch-email-new-claim"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="emailClaimApproved">Claim approved</Label>
                      <Switch
                        id="emailClaimApproved"
                        checked={notifications.emailClaimApproved}
                        onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, emailClaimApproved: checked }))}
                        data-testid="switch-email-approved"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="emailClaimDenied">Claim denied or requires revision</Label>
                      <Switch
                        id="emailClaimDenied"
                        checked={notifications.emailClaimDenied}
                        onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, emailClaimDenied: checked }))}
                        data-testid="switch-email-denied"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  SMS Notifications
                </CardTitle>
                <CardDescription>
                  Get text message alerts for urgent updates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="smsEnabled" className="text-base">Enable SMS Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive urgent alerts via text message</p>
                  </div>
                  <Switch
                    id="smsEnabled"
                    checked={notifications.smsEnabled}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, smsEnabled: checked }))}
                    data-testid="switch-sms-enabled"
                  />
                </div>
                {notifications.smsEnabled && (
                  <div className="space-y-3 pl-4 border-l-2 border-muted">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="smsUrgentAlerts">Urgent claim alerts only</Label>
                      <Switch
                        id="smsUrgentAlerts"
                        checked={notifications.smsUrgentAlerts}
                        onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, smsUrgentAlerts: checked }))}
                        data-testid="switch-sms-urgent"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Digest Frequency
                </CardTitle>
                <CardDescription>
                  How often would you like to receive summary emails?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  value={notifications.digestFrequency}
                  onValueChange={(value) => setNotifications(prev => ({ ...prev, digestFrequency: value }))}
                >
                  <SelectTrigger data-testid="select-digest-frequency">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="realtime">Real-time (instant)</SelectItem>
                    <SelectItem value="daily">Daily digest</SelectItem>
                    <SelectItem value="weekly">Weekly summary</SelectItem>
                    <SelectItem value="never">Never (disabled)</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleSaveNotifications} data-testid="button-save-notifications">
                  <Save className="h-4 w-4 mr-2" />
                  Save Notification Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System & Admin Tab */}
          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database Status
                </CardTitle>
                <CardDescription>
                  Connection status and database statistics.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={loadSystemStatus}
                  disabled={isLoadingSystem}
                  variant="outline"
                  size="sm"
                  data-testid="button-refresh-status"
                >
                  {isLoadingSystem ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Refresh Status
                </Button>

                {systemStatus && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {systemStatus.database.connected ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <div className="font-medium">
                          {systemStatus.database.connected ? 'Connected' : 'Disconnected'}
                        </div>
                        {systemStatus.database.version && (
                          <div className="text-sm text-muted-foreground">
                            {systemStatus.database.version}
                          </div>
                        )}
                        {systemStatus.database.error && (
                          <div className="text-sm text-red-600">
                            {systemStatus.database.error}
                          </div>
                        )}
                      </div>
                    </div>

                    {systemStatus.counts && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="p-3 bg-muted/50 rounded-lg text-center">
                          <FolderOpen className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{systemStatus.counts.claims}</div>
                          <div className="text-xs text-muted-foreground">Claims</div>
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg text-center">
                          <FileText className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{systemStatus.counts.estimates}</div>
                          <div className="text-xs text-muted-foreground">Estimates</div>
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg text-center">
                          <Package className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{systemStatus.counts.lineItems}</div>
                          <div className="text-xs text-muted-foreground">Line Items</div>
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg text-center">
                          <DollarSign className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{systemStatus.counts.priceLists}</div>
                          <div className="text-xs text-muted-foreground">Price Lists</div>
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg text-center">
                          <MapPin className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{systemStatus.counts.regions}</div>
                          <div className="text-xs text-muted-foreground">Regions</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Configured Regions
                </CardTitle>
                <CardDescription>
                  Geographic regions available for pricing calculations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {systemStatus?.regions && systemStatus.regions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {systemStatus.regions.map((region) => (
                      <Badge key={region.id} variant="outline" className="py-1.5">
                        <MapPin className="h-3 w-3 mr-1" />
                        {region.name || region.id}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No regions configured. Click "Refresh Status" to load region data.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Service Status
                </CardTitle>
                <CardDescription>
                  External service connections and API status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">OpenAI API</span>
                    </div>
                    {systemStatus?.openaiConfigured ? (
                      <Badge className="bg-green-100 text-green-800">Configured</Badge>
                    ) : (
                      <Badge variant="secondary">Not Configured</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">PostgreSQL</span>
                    </div>
                    {systemStatus?.database.connected ? (
                      <Badge className="bg-green-100 text-green-800">Connected</Badge>
                    ) : (
                      <Badge variant="destructive">Disconnected</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Environment</span>
                    </div>
                    <Badge variant="outline">{systemStatus?.environment || 'Unknown'}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Price Scraper
                </CardTitle>
                <CardDescription>
                  Fetch current material prices from Home Depot to update regional pricing data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Button 
                    onClick={runHomeDepotScraper} 
                    disabled={isScrapingHomeDepot}
                    data-testid="button-run-scraper"
                  >
                    {isScrapingHomeDepot ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Scraping...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Run Scraper
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    onClick={loadScraperConfig}
                    disabled={isLoadingConfig}
                    data-testid="button-view-config"
                  >
                    {isLoadingConfig ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <SettingsIcon className="h-4 w-4 mr-2" />
                    )}
                    View Configuration
                  </Button>
                </div>

                {lastScrapeResult && (
                  <div className="p-4 bg-muted rounded-lg space-y-2" data-testid="scrape-result">
                    <div className="flex items-center gap-2">
                      {lastScrapeResult.status === 'completed' ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <span className="font-medium">Last Scrape Result</span>
                      <Badge variant={lastScrapeResult.status === 'completed' ? 'default' : 'destructive'}>
                        {lastScrapeResult.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground grid grid-cols-2 gap-2">
                      <div>Job ID: <code className="text-xs">{lastScrapeResult.jobId}</code></div>
                      <div>Items Processed: {lastScrapeResult.itemsProcessed}</div>
                      <div>Items Updated: {lastScrapeResult.itemsUpdated}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Permanently delete all claims and related data. This action cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!showPurgeConfirm ? (
                  <Button
                    variant="destructive"
                    onClick={() => setShowPurgeConfirm(true)}
                    data-testid="button-purge-claims"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Purge All Claims
                  </Button>
                ) : (
                  <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg space-y-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-destructive">Are you absolutely sure?</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          This will permanently delete ALL claims, documents, photos, estimates, briefings,
                          and all related data from your organization. This action cannot be undone.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="destructive"
                        onClick={handlePurgeAllClaims}
                        disabled={isPurgingClaims}
                        data-testid="button-confirm-purge"
                      >
                        {isPurgingClaims ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Purging...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Yes, Delete Everything
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowPurgeConfirm(false)}
                        disabled={isPurgingClaims}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations" className="space-y-6">
            <MS365IntegrationCard />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// MS365 Integration Card Component
function MS365IntegrationCard() {
  const { toast } = useToast();
  const searchString = useSearch();
  const [status, setStatus] = useState<{ connected: boolean; configured: boolean; expiresAt: string | null } | null>(null);
  const [syncStatus, setSyncStatus] = useState<CalendarSyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [syncFrequency, setSyncFrequency] = useState('15');

  useEffect(() => {
    checkConnectionStatus();
    checkSyncStatus();
    
    // Handle OAuth callback messages
    const params = new URLSearchParams(searchString);
    if (params.get('ms365_connected') === 'true') {
      toast({ title: "Connected!", description: "Your Microsoft 365 calendar is now connected." });
      checkConnectionStatus();
      checkSyncStatus();
    } else if (params.get('ms365_error')) {
      const error = params.get('ms365_error');
      const messages: Record<string, string> = {
        'auth_denied': 'Authorization was denied',
        'invalid_callback': 'Invalid callback received',
        'token_exchange': 'Failed to complete authentication',
        'callback_failed': 'Connection failed - please try again',
      };
      toast({ 
        title: "Connection Failed", 
        description: messages[error!] || 'Unknown error',
        variant: "destructive"
      });
    }
  }, [searchString]);

  const checkConnectionStatus = async () => {
    try {
      setIsLoading(true);
      // Use the existing endpoint
      const response = await fetch('/api/auth/ms365/status', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        setStatus({ connected: false, configured: false, expiresAt: null });
      }
    } catch (error) {
      // Failed to check MS365 status - will show error state
      setStatus({ connected: false, configured: false, expiresAt: null });
    } finally {
      setIsLoading(false);
    }
  };

  const checkSyncStatus = async () => {
    try {
      const sync = await getCalendarSyncStatus();
      setSyncStatus(sync);
    } catch (error) {
      // Sync status check failed - not critical
    }
  };

  const handleConnect = () => {
    setIsConnecting(true);
    // Navigate directly to the connect endpoint which will redirect to Microsoft
    window.location.href = '/api/auth/ms365/connect';
  };

  const handleDisconnect = async () => {
    try {
      setIsDisconnecting(true);
      await disconnectMs365();
      toast({ title: "Disconnected", description: "Microsoft 365 calendar has been disconnected." });
      setStatus({ connected: false, configured: status?.configured || false, expiresAt: null });
      setSyncStatus(null);
    } catch (error) {
      toast({
        title: "Disconnect Failed",
        description: error instanceof Error ? error.message : "Failed to disconnect from Microsoft 365",
        variant: "destructive"
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSync = async (direction: 'pull' | 'push' | 'full') => {
    try {
      setIsSyncing(true);
      let result: CalendarSyncResult;

      switch (direction) {
        case 'pull':
          result = await syncCalendarFromMs365();
          break;
        case 'push':
          result = await syncCalendarToMs365();
          break;
        case 'full':
          result = await syncCalendarFull();
          break;
      }

      if (result.success) {
        toast({
          title: "Sync Complete",
          description: `Pulled ${result.pulled}, pushed ${result.pushed}, updated ${result.updated}${result.conflicts > 0 ? `, ${result.conflicts} conflicts` : ''}`,
        });
        checkSyncStatus();
      } else {
        toast({
          title: "Sync Failed",
          description: result.errors.join('; ') || 'Sync completed with errors',
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Microsoft 365 Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Checking connection status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status?.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Microsoft 365 Calendar
          </CardTitle>
          <CardDescription>
            Sync your inspection appointments with your Microsoft 365 calendar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Not Configured</p>
                <p className="text-sm text-amber-700 mt-1">
                  Microsoft 365 integration requires Azure AD app configuration. 
                  Please contact your administrator to set up AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Microsoft 365 Calendar
        </CardTitle>
        <CardDescription>
          Sync your inspection appointments with your Microsoft 365 calendar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <>
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <div className="flex-1">
                <p className="font-medium text-emerald-800">Connected</p>
                <p className="text-sm text-emerald-700">
                  Your Microsoft 365 calendar is synced. Scheduled inspections will appear in your calendar.
                </p>
                {syncStatus && (
                  <div className="mt-2 text-xs text-emerald-600">
                    {syncStatus.lastSyncTime ? (
                      <>Last sync: {new Date(syncStatus.lastSyncTime).toLocaleString()}</>
                    ) : (
                      <>No sync yet</>
                    )}
                    {syncStatus.pendingSyncs > 0 && (
                      <> • {syncStatus.pendingSyncs} pending</>
                    )}
                    {syncStatus.errorCount > 0 && (
                      <> • <span className="text-red-600">{syncStatus.errorCount} errors</span></>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Sync Controls */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label htmlFor="autoSync" className="text-sm font-medium">Automatic Sync</Label>
                <Switch
                  id="autoSync"
                  checked={autoSyncEnabled}
                  onCheckedChange={setAutoSyncEnabled}
                />
              </div>

              {autoSyncEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="syncFrequency" className="text-sm">Sync Frequency</Label>
                  <Select value={syncFrequency} onValueChange={setSyncFrequency}>
                    <SelectTrigger id="syncFrequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">Every 15 minutes</SelectItem>
                      <SelectItem value="30">Every 30 minutes</SelectItem>
                      <SelectItem value="60">Every hour</SelectItem>
                      <SelectItem value="manual">Manual only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <Label className="text-sm font-medium">Manual Sync</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync('pull')}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>Pull from MS365</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync('push')}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>Push to MS365</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync('full')}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>Full Sync</>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="text-destructive hover:text-destructive w-full"
              data-testid="button-disconnect-ms365"
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                <>
                  <Unlink className="h-4 w-4 mr-2" />
                  Disconnect Calendar
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Connect your Microsoft 365 account to automatically sync inspection appointments to your Outlook calendar.
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>See scheduled inspections in your calendar</li>
                <li>Get reminders for upcoming appointments</li>
                <li>View your route for the day</li>
              </ul>
            </div>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              data-testid="button-connect-ms365"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-2" />
                  Connect Microsoft 365 Calendar
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
