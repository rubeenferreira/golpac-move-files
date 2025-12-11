import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@vercel/kv';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // Allow any origin to hit the install endpoint (protected by Token anyway)
  const origin = request.headers.origin || '*';

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-install-token'
  );

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = request.headers['x-install-token'];
  const validToken = process.env.INSTALL_TOKEN || 'dxTLRLGrGg3Jh2ZujTLaavsg';

  if (token !== validToken) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  // Initialize KV client
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!kvUrl || !kvToken) {
    return response.status(503).json({ error: "Database not connected." });
  }

  const kv = createClient({
    url: kvUrl,
    token: kvToken,
  });

  try {
    const data = request.body;
    
    // DEBUGGING: Log the incoming payload to Vercel Logs
    console.log("Incoming Heartbeat:", JSON.stringify(data));
    
    // Basic validation
    if (!data || !data.installId || !data.hostname) {
        return response.status(400).json({ error: "Missing required fields (installId, hostname)" });
    }

    const key = `device:${data.installId}`;

    // 1. Add ID to a set of all device IDs (idempotent)
    await kv.sadd('device_ids', data.installId);

    // 2. Fetch existing data to perform a MERGE
    const existingData: any = await kv.get(key) || {};

    // 3. Normalization Logic (Handle Go/JSON casing issues)
    const appUsageRaw = data.appUsage || data.AppUsage || data.app_usage;
    const webUsageRaw = data.webUsage || data.WebUsage || data.web_usage;
    const userName = data.userName || data.UserName || data.username || data.user;
    const osVersion = data.osVersion || data.OsVersion || data.OSVersion;

    // CRITICAL FIX: Only update usage stats if the incoming array HAS DATA.
    // This prevents empty heartbeats from wiping out the charts.
    const appUsage = (Array.isArray(appUsageRaw) && appUsageRaw.length > 0) ? appUsageRaw : undefined;
    const webUsage = (Array.isArray(webUsageRaw) && webUsageRaw.length > 0) ? webUsageRaw : undefined;

    // Construct the normalized payload
    const normalizedNewData = {
        ...data,
        ...(appUsage && { appUsage }), // Only overwrite if we received actual items
        ...(webUsage && { webUsage }),
        ...(userName && { userName }),
        ...(osVersion && { osVersion })
    };

    // 4. Merge Logic
    const updatedData = {
        ...existingData,       // Keep old fields (company, notes, etc.)
        ...normalizedNewData,  // Overwrite with new normalized data
        lastSeen: new Date().toISOString() // Always update timestamp
    };

    // Store the merged object
    await kv.set(key, updatedData);

    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error("API Error:", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}