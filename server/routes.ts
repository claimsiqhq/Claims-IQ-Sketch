import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { runScrapeJob, testScrape, PRODUCT_MAPPINGS, STORE_REGIONS } from "./scraper/homeDepot";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post('/api/scrape/home-depot', async (req, res) => {
    try {
      const result = await runScrapeJob();
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/scrape/test', async (req, res) => {
    try {
      const results = await testScrape();
      const data = Array.from(results.entries()).map(([sku, product]) => ({
        sku,
        name: product.name,
        price: product.price,
        unit: product.unit,
        url: product.url
      }));
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/scrape/config', (req, res) => {
    res.json({
      productMappings: PRODUCT_MAPPINGS,
      storeRegions: STORE_REGIONS
    });
  });

  return httpServer;
}
