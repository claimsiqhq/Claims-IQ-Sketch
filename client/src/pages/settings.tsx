import { useState } from "react";
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
  DollarSign
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

export default function Settings() {
  const { toast } = useToast();
  const [isScrapingHomeDepot, setIsScrapingHomeDepot] = useState(false);
  const [lastScrapeResult, setLastScrapeResult] = useState<ScrapeJobResult | null>(null);
  const [scraperConfig, setScraperConfig] = useState<ScraperConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

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

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Scheduled Jobs
                </CardTitle>
                <CardDescription>
                  Configure automatic price updates and data synchronization.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Scheduled jobs are not yet configured. Price updates are currently triggered manually.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Configuration</CardTitle>
                <CardDescription>
                  General system settings and preferences.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  System configuration options will be available here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
