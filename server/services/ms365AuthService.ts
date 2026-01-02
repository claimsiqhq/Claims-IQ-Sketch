/**
 * Microsoft 365 OAuth Authentication Service
 * 
 * Handles OAuth 2.0 flow for Microsoft Graph API access to calendars.
 * Uses MSAL (Microsoft Authentication Library) for token management.
 */

import * as msal from '@azure/msal-node';
import { Client as GraphClient, AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import 'isomorphic-fetch';

// Environment variables for Azure AD app
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || '';
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || 'common';
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || '';

// Get the base URL for redirects
function getBaseUrl(): string {
  // In production, use the deployed URL
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000'}`;
  }
  // In development, use the dev URL
  return `https://${process.env.REPLIT_DEV_DOMAIN || 'localhost:5000'}`;
}

const REDIRECT_URI = `${getBaseUrl()}/api/auth/ms365/callback`;

// Scopes for calendar access
const SCOPES = [
  'User.Read',
  'Calendars.Read',
  'Calendars.ReadWrite',
  'offline_access',
];

// MSAL Configuration
const msalConfig: msal.Configuration = {
  auth: {
    clientId: AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
    clientSecret: AZURE_CLIENT_SECRET,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        if (!containsPii) {
          console.log(`[MSAL] ${message}`);
        }
      },
      piiLoggingEnabled: false,
      logLevel: msal.LogLevel.Warning,
    },
  },
};

// Create MSAL confidential client application
let msalClient: msal.ConfidentialClientApplication | null = null;

function getMsalClient(): msal.ConfidentialClientApplication {
  if (!msalClient) {
    if (!AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
      throw new Error('Microsoft 365 integration not configured. Please set AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET.');
    }
    msalClient = new msal.ConfidentialClientApplication(msalConfig);
  }
  return msalClient;
}

/**
 * Check if MS365 integration is configured
 */
export function isMs365Configured(): boolean {
  return Boolean(AZURE_CLIENT_ID && AZURE_CLIENT_SECRET);
}

/**
 * Generate the authorization URL for OAuth flow
 */
export async function getAuthorizationUrl(userId: string): Promise<string> {
  const client = getMsalClient();
  
  const authCodeUrlParameters: msal.AuthorizationUrlRequest = {
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    state: userId, // Pass user ID in state for callback
  };

  return await client.getAuthCodeUrl(authCodeUrlParameters);
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const client = getMsalClient();

  try {
    const tokenRequest: msal.AuthorizationCodeRequest = {
      code,
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
    };

    const response = await client.acquireTokenByCode(tokenRequest);

    if (!response || !response.accessToken) {
      return { success: false, error: 'No access token received' };
    }

    // Store tokens in database
    await storeUserTokens(userId, {
      accessToken: response.accessToken,
      refreshToken: (response as any).refreshToken || null,
      expiresAt: response.expiresOn?.toISOString() || null,
      accountId: response.account?.homeAccountId || null,
    });

    return { success: true };
  } catch (error) {
    console.error('[MS365] Token exchange failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Token exchange failed' 
    };
  }
}

/**
 * Store user tokens in database
 */
async function storeUserTokens(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string | null;
    accountId: string | null;
  }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('user_ms365_tokens')
    .upsert({
      user_id: userId,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      account_id: tokens.accountId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (error) {
    console.error('[MS365] Failed to store tokens:', error);
    throw error;
  }
}

/**
 * Get stored tokens for a user
 */
export async function getUserTokens(userId: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  accountId: string | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('user_ms365_tokens')
    .select('access_token, refresh_token, expires_at, account_id')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    accountId: data.account_id,
  };
}

/**
 * Check if a user is connected to MS365
 */
export async function isUserConnected(userId: string): Promise<boolean> {
  const tokens = await getUserTokens(userId);
  return tokens !== null && tokens.accessToken !== null;
}

/**
 * Refresh access token if expired
 */
export async function refreshAccessToken(userId: string): Promise<string | null> {
  const tokens = await getUserTokens(userId);
  if (!tokens?.refreshToken) {
    return null;
  }

  // Check if token is still valid (with 5 min buffer)
  if (tokens.expiresAt) {
    const expiresAt = new Date(tokens.expiresAt);
    const buffer = 5 * 60 * 1000; // 5 minutes
    if (expiresAt.getTime() - buffer > Date.now()) {
      return tokens.accessToken;
    }
  }

  // Token expired, refresh it
  const client = getMsalClient();

  try {
    const refreshRequest: msal.RefreshTokenRequest = {
      refreshToken: tokens.refreshToken,
      scopes: SCOPES,
    };

    const response = await client.acquireTokenByRefreshToken(refreshRequest);

    if (response?.accessToken) {
      await storeUserTokens(userId, {
        accessToken: response.accessToken,
        refreshToken: (response as any).refreshToken || tokens.refreshToken,
        expiresAt: response.expiresOn?.toISOString() || null,
        accountId: response.account?.homeAccountId || null,
      });
      return response.accessToken;
    }
  } catch (error) {
    console.error('[MS365] Token refresh failed:', error);
  }

  return null;
}

/**
 * Get a valid access token for a user (refreshing if needed)
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const tokens = await getUserTokens(userId);
  if (!tokens) {
    return null;
  }

  // Check if token is still valid (with 5 min buffer)
  if (tokens.expiresAt) {
    const expiresAt = new Date(tokens.expiresAt);
    const buffer = 5 * 60 * 1000; // 5 minutes
    if (expiresAt.getTime() - buffer > Date.now()) {
      return tokens.accessToken;
    }
  }

  // Token expired or expiring soon, try to refresh
  return await refreshAccessToken(userId);
}

/**
 * Get Microsoft Graph client for a user
 */
export async function getGraphClient(userId: string): Promise<GraphClient | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return null;
  }

  const authProvider: AuthenticationProvider = {
    getAccessToken: async () => accessToken,
  };

  return GraphClient.initWithMiddleware({ authProvider });
}

/**
 * Disconnect user from MS365 (revoke tokens)
 */
export async function disconnectUser(userId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('user_ms365_tokens')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[MS365] Failed to disconnect user:', error);
    return false;
  }

  return true;
}

/**
 * Get connection status for a user
 */
export async function getConnectionStatus(userId: string): Promise<{
  connected: boolean;
  configured: boolean;
  expiresAt: string | null;
}> {
  const configured = isMs365Configured();
  
  if (!configured) {
    return { connected: false, configured: false, expiresAt: null };
  }

  const tokens = await getUserTokens(userId);
  
  return {
    connected: tokens !== null,
    configured: true,
    expiresAt: tokens?.expiresAt || null,
  };
}
