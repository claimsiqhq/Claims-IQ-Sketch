// Load environment variables from .env file BEFORE any other imports
import 'dotenv/config';

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./middleware/auth";
import { initializeStorageBucket } from "./services/documents";
import { seedAdminUser } from "./services/auth";

const app = express();
app.set('trust proxy', 1);

// Disable ETags for auth endpoints to prevent 304 caching issues
app.use('/api/auth', (req, res, next) => {
  // Remove ETag header from auth responses to prevent 304 Not Modified
  res.removeHeader('ETag');
  // Set cache control headers as a fallback
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Setup authentication middleware
setupAuth(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize Supabase storage buckets
  try {
    await initializeStorageBucket();
    log('Supabase storage buckets initialized', 'supabase');
  } catch (error) {
    log(`Warning: Could not initialize Supabase storage buckets: ${error}`, 'supabase');
    // Continue startup - storage will fail at runtime if not configured
  }

  // Initialize photos bucket
  try {
    const { initializePhotosBucket } = await import('./services/photos');
    await initializePhotosBucket();
    log('Photos storage bucket initialized', 'supabase');
  } catch (error) {
    log(`Warning: Could not initialize photos storage bucket: ${error}`, 'supabase');
    // Continue startup - photos will fail at runtime if not configured
  }

  // Seed admin user for development/testing
  try {
    await seedAdminUser();
  } catch (error) {
    log(`Warning: Could not seed admin user: ${error}`, 'auth');
  }

  // Geocode any claims that are missing coordinates (runs in background)
  try {
    const { geocodePendingClaims } = await import('./services/geocoding');
    // Start geocoding in background, don't await
    geocodePendingClaims().then(count => {
      if (count > 0) {
        log(`Queued ${count} claims for geocoding`, 'geocoding');
      }
    }).catch(err => {
      log(`Geocoding startup error: ${err}`, 'geocoding');
    });
  } catch (error) {
    log(`Warning: Could not start geocoding: ${error}`, 'geocoding');
  }

  await registerRoutes(httpServer, app);

  // Initialize calendar sync scheduler
  try {
    const { initializeSyncScheduler } = await import('./services/calendarSyncScheduler');
    initializeSyncScheduler({
      enabled: process.env.CALENDAR_SYNC_ENABLED !== 'false',
      intervalMinutes: parseInt(process.env.CALENDAR_SYNC_INTERVAL_MINUTES || '15', 10),
      dateRangeDays: parseInt(process.env.CALENDAR_SYNC_DATE_RANGE_DAYS || '28', 10), // Default: 4 weeks
    });
    log('Calendar sync scheduler initialized', 'calendar-sync');
  } catch (error) {
    log(`Warning: Could not initialize calendar sync scheduler: ${error}`, 'calendar-sync');
    // Continue startup - sync will just be disabled
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
