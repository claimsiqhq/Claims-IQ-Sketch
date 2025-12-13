import { useState, useEffect } from "react";
import Layout from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Mic,
  Package,
  FileText,
  MapPin,
  TrendingUp,
  ExternalLink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
    materials: number;
    lineItems: number;
    regions: number;
    prices: number;
  };
  regions?: { id: string; name: string }[];
  environment: string;
  openaiConfigured: boolean;
}

export default function Settings() {
  const { toast } = useToast();
  const [isScrapingHomeDepot, setIsScrapingHomeDepot] = useState(false);
  const [lastScrapeResult, setLastScrapeResult] = useState<ScrapeJobResult | null>(null);
  const [scraperConfig, setScraperConfig] = useState<ScraperConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [scrapedPrices, setScrapedPrices] = useState<ScrapedPrice[]>([]);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isLoadingSystem, setIsLoadingSystem] = useState(false);

  const runHomeDepotScraper = async () => {
    setIsScrapingHomeDepot(true);
    try {
      const response = await fetch('/api/scrape/home-depot', { method: 'POST' });
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
      const response = await fetch('/api/scrape/config');
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
        fetch('/api/scrape/prices'),
        fetch('/api/scrape/jobs')
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
      const response = await fetch('/api/system/status');
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

  // Load system status on mount
  useEffect(() => {
    loadSystemStatus();
  }, []);

  // Group prices by SKU for display
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

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Admin Settings</h1>
          <p className="text-muted-foreground mt-1">Manage system configuration and data pipelines</p>
        </div>

        <Tabs defaultValue="pricing" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pricing" data-testid="tab-pricing">
              <DollarSign className="h-4 w-4 mr-2" />
              Pricing Data
            </TabsTrigger>
            <TabsTrigger value="system" data-testid="tab-system">
              <SettingsIcon className="h-4 w-4 mr-2" />
              System
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pricing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Home Depot Price Scraper
                </CardTitle>
                <CardDescription>
                  Fetch current material prices from Home Depot to update regional pricing data.
                  This updates the material_regional_prices table for Dallas, San Francisco, and Miami regions.
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

                {scraperConfig && (
                  <div className="space-y-4" data-testid="scraper-config">
                    <div>
                      <h4 className="font-medium mb-2">Product Mappings</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {Object.entries(scraperConfig.productMappings).map(([sku, mapping]) => (
                          <div key={sku} className="p-3 bg-muted/50 rounded-md text-sm">
                            <div className="font-mono font-medium">{sku}</div>
                            <div className="text-muted-foreground">Search: "{mapping.search}"</div>
                            <div className="text-muted-foreground">Unit: {mapping.unit}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Store Regions</h4>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(scraperConfig.storeRegions).map(([region, storeId]) => (
                          <Badge key={region} variant="outline">
                            {region}: Store #{storeId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Scraped Prices Visualization */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Scraped Price Data
                </CardTitle>
                <CardDescription>
                  View the actual prices returned by the Home Depot scraper across different regions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={loadScrapedPrices}
                  disabled={isLoadingPrices}
                  variant="outline"
                  data-testid="button-load-prices"
                >
                  {isLoadingPrices ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Load Scraped Prices
                    </>
                  )}
                </Button>

                {Object.keys(groupedPrices).length > 0 && (
                  <div className="overflow-x-auto" data-testid="prices-table">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">SKU</th>
                          <th className="text-left py-2 px-3 font-medium">Material</th>
                          <th className="text-left py-2 px-3 font-medium">Unit</th>
                          <th className="text-right py-2 px-3 font-medium">Dallas</th>
                          <th className="text-right py-2 px-3 font-medium">San Francisco</th>
                          <th className="text-right py-2 px-3 font-medium">Miami</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(groupedPrices).map((item) => (
                          <tr key={item.sku} className="border-b border-muted hover:bg-muted/50">
                            <td className="py-2 px-3 font-mono text-xs">{item.sku}</td>
                            <td className="py-2 px-3">{item.name}</td>
                            <td className="py-2 px-3">
                              <Badge variant="secondary">{item.unit}</Badge>
                            </td>
                            <td className="py-2 px-3 text-right">
                              {item.regions['US-TX-DAL'] ? (
                                <span className="font-medium text-green-600">
                                  ${item.regions['US-TX-DAL'].price.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {item.regions['US-CA-SF'] ? (
                                <span className="font-medium text-blue-600">
                                  ${item.regions['US-CA-SF'].price.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {item.regions['US-FL-MIA'] ? (
                                <span className="font-medium text-orange-600">
                                  ${item.regions['US-FL-MIA'].price.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {scrapedPrices.length === 0 && !isLoadingPrices && (
                  <p className="text-sm text-muted-foreground">
                    No scraped prices found. Run the scraper to populate price data.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Scrape Job History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Scrape Job History
                </CardTitle>
                <CardDescription>
                  Recent price scraping jobs and their results.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scrapeJobs.length > 0 ? (
                  <div className="space-y-2">
                    {scrapeJobs.map((job) => (
                      <div key={job.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                        <div className="flex items-center gap-3">
                          {job.status === 'completed' ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : job.status === 'failed' ? (
                            <XCircle className="h-4 w-4 text-red-600" />
                          ) : (
                            <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />
                          )}
                          <div>
                            <div className="text-sm font-medium">
                              {job.source === 'home_depot' ? 'Home Depot Scrape' : job.source}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(job.started_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                            {job.status}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            {job.items_processed} processed, {job.items_updated} updated
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No scrape jobs found. Click "Load Scraped Prices" above to fetch job history.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            {/* Database Status */}
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
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-3 bg-muted/50 rounded-lg text-center">
                          <Package className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{systemStatus.counts.materials}</div>
                          <div className="text-xs text-muted-foreground">Materials</div>
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg text-center">
                          <FileText className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{systemStatus.counts.lineItems}</div>
                          <div className="text-xs text-muted-foreground">Line Items</div>
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg text-center">
                          <MapPin className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{systemStatus.counts.regions}</div>
                          <div className="text-xs text-muted-foreground">Regions</div>
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg text-center">
                          <DollarSign className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-2xl font-bold">{systemStatus.counts.prices}</div>
                          <div className="text-xs text-muted-foreground">Price Records</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Regions Configuration */}
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

            {/* Service Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Service Status
                </CardTitle>
                <CardDescription>
                  External service connections and API status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                    <div className="flex items-center gap-3">
                      <Mic className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">Voice API (OpenAI)</div>
                        <div className="text-xs text-muted-foreground">Real-time voice processing</div>
                      </div>
                    </div>
                    {systemStatus?.openaiConfigured ? (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <XCircle className="h-3 w-3 mr-1" />
                        Not Configured
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                    <div className="flex items-center gap-3">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">Home Depot Scraper</div>
                        <div className="text-xs text-muted-foreground">Material price updates</div>
                      </div>
                    </div>
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Available
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Environment Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Environment
                </CardTitle>
                <CardDescription>
                  Application environment and build information.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Mode</div>
                    <div className="font-medium mt-1">
                      <Badge variant={systemStatus?.environment === 'production' ? 'default' : 'secondary'}>
                        {systemStatus?.environment || 'Unknown'}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Server Time</div>
                    <div className="text-sm mt-1">
                      {systemStatus?.database.time
                        ? new Date(systemStatus.database.time).toLocaleString()
                        : '—'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
