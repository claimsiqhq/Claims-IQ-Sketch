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
// Support both MS365_* and AZURE_* naming (MS365_* takes priority for backward compatibility)
const AZURE_CLIENT_ID = process.env.MS365_CLIENT_ID || process.env.AZURE_CLIENT_ID || '';
const AZURE_TENANT_ID = process.env.MS365_TENANT_ID || process.env.AZURE_TENANT_ID || 'common';
const AZURE_CLIENT_SECRET = process.env.MS365_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '';

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
      throw new Error('Microsoft 365 integration not configured. Please set MS365_CLIENT_ID (or AZURE_CLIENT_ID), MS365_TENANT_ID (or AZURE_TENANT_ID), and MS365_CLIENT_SECRET (or AZURE_CLIENT_SECRET).');
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
  // First, try to check if record exists
  const { data: existing, error: checkError } = await supabaseAdmin
    .from('user_ms365_tokens')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing && !checkError) {
    // Update existing record
    const { error } = await supabaseAdmin
      .from('user_ms365_tokens')
      .update({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.expiresAt,
        account_id: tokens.accountId,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('[MS365] Failed to update tokens:', error);
      throw error;
    }
  } else {
    // Insert new record
    const { error } = await supabaseAdmin
      .from('user_ms365_tokens')
      .insert({
        user_id: userId,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.expiresAt,
        account_id: tokens.accountId,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[MS365] Failed to insert tokens:', error);
      throw error;
    }
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
 * Check if a user is connected to MS365 with valid tokens
 * This verifies the tokens are not just present but actually usable
 */
export async function isUserConnected(userId: string): Promise<boolean> {
  const tokens = await getUserTokens(userId);
  if (!tokens || !tokens.accessToken) {
    return false;
  }

  // Check if the access token is still valid (with 5 min buffer)
  if (tokens.expiresAt) {
    const expiresAt = new Date(tokens.expiresAt);
    const buffer = 5 * 60 * 1000; // 5 minutes
    if (expiresAt.getTime() - buffer <= Date.now()) {
      // Token is expired, check if we have a refresh token
      if (!tokens.refreshToken) {
        console.log('[MS365] Access token expired and no refresh token available');
        return false;
      }
      // Try to refresh the token
      const validToken = await getValidAccessToken(userId);
      if (!validToken) {
        console.log('[MS365] Token refresh failed - user needs to reconnect');
        return false;
      }
    }
  }

  return true;
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
      console.log('[MS365] Token refreshed successfully for user', userId);
      return response.accessToken;
    }
    console.error('[MS365] Token refresh returned no access token');
  } catch (error: any) {
    // Check for specific error types that indicate the refresh token is expired
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('invalid_grant') ||
        errorMessage.includes('expired') ||
        errorMessage.includes('revoked') ||
        errorMessage.includes('AADSTS')) {
      console.error('[MS365] Refresh token expired or revoked - user must reconnect:', errorMessage);
      // Clear invalid tokens so the UI shows disconnected state
      try {
        await disconnectUser(userId);
      } catch (clearError) {
        console.error('[MS365] Failed to clear invalid tokens:', clearError);
      }
    } else {
      console.error('[MS365] Token refresh failed with unexpected error:', error);
    }
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
 * Verify that the token actually works by making a test API call to Microsoft Graph
 * This catches cases where tokens exist but are revoked, or Azure AD config changed
 */
async function verifyTokenWithApi(accessToken: string): Promise<boolean> {
  try {
    // Make a lightweight call to verify the token works
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return true;
    }

    // Token was rejected by Microsoft
    const errorData = await response.json().catch(() => ({}));
    console.log('[MS365] Token verification failed:', response.status, errorData);
    return false;
  } catch (error) {
    console.error('[MS365] Token verification request failed:', error);
    return false;
  }
}

/**
 * Get connection status for a user
 * This now actually verifies the token works with Microsoft's API
 */
export async function getConnectionStatus(userId: string): Promise<{
  connected: boolean;
  configured: boolean;
  expiresAt: string | null;
  expired: boolean;
  lastVerified?: string;
}> {
  const configured = isMs365Configured();

  if (!configured) {
    return { connected: false, configured: false, expiresAt: null, expired: false };
  }

  const tokens = await getUserTokens(userId);

  if (!tokens) {
    return { connected: false, configured: true, expiresAt: null, expired: false };
  }

  // Check if token is expired
  const expiresAt = tokens.expiresAt ? new Date(tokens.expiresAt) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : true;

  // If expired or close to expiring, try to refresh the token
  if (isExpired && tokens.refreshToken) {
    try {
      const newAccessToken = await getValidAccessToken(userId);
      if (newAccessToken) {
        // Token was successfully refreshed, verify it works
        const verified = await verifyTokenWithApi(newAccessToken);
        if (verified) {
          const updatedTokens = await getUserTokens(userId);
          return {
            connected: true,
            configured: true,
            expiresAt: updatedTokens?.expiresAt || null,
            expired: false,
            lastVerified: new Date().toISOString(),
          };
        }
        // Token refreshed but doesn't work - clear it
        console.log('[MS365] Refreshed token failed verification, clearing tokens');
        await disconnectUser(userId);
        return {
          connected: false,
          configured: true,
          expiresAt: null,
          expired: true,
        };
      }
    } catch (error) {
      console.error('[MS365] Token refresh failed during status check:', error);
    }

    // Refresh failed - user needs to reconnect
    return {
      connected: false,
      configured: true,
      expiresAt: tokens.expiresAt,
      expired: true,
    };
  }

  // Token exists and isn't expired - but verify it actually works with Microsoft
  // This catches cases where the token was revoked, or Azure AD config changed
  const verified = await verifyTokenWithApi(tokens.accessToken);
  if (!verified) {
    console.log('[MS365] Existing token failed verification, attempting refresh');
    // Try to refresh the token
    if (tokens.refreshToken) {
      const newAccessToken = await refreshAccessToken(userId);
      if (newAccessToken) {
        const reVerified = await verifyTokenWithApi(newAccessToken);
        if (reVerified) {
          const updatedTokens = await getUserTokens(userId);
          return {
            connected: true,
            configured: true,
            expiresAt: updatedTokens?.expiresAt || null,
            expired: false,
            lastVerified: new Date().toISOString(),
          };
        }
      }
    }
    // Token is invalid and couldn't be refreshed
    console.log('[MS365] Token verification and refresh both failed, clearing tokens');
    await disconnectUser(userId);
    return {
      connected: false,
      configured: true,
      expiresAt: null,
      expired: true,
    };
  }

  return {
    connected: true,
    configured: true,
    expiresAt: tokens.expiresAt || null,
    expired: false,
    lastVerified: new Date().toISOString(),
  };
}
