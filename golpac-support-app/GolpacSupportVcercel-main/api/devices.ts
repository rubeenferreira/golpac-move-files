import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@vercel/kv';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // Dynamic CORS: Automatically allow the requesting origin if it's a Vercel app or Localhost
  const origin = request.headers.origin;
  const allowedOrigin = origin && (origin.endsWith('.vercel.app') || origin.includes('localhost')) 
    ? origin 
    : "https://golpac-support-panel.vercel.app"; // Fallback to production domain

  response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return response.status(200).end();

  // Initialize KV client using the keys you provided
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!kvUrl || !kvToken) {
    console.warn("Database credentials missing");
    // Return empty list to prevent frontend crash if DB isn't linked yet
    return response.status(200).json([]);
  }

  const kv = createClient({
    url: kvUrl,
    token: kvToken,
  });

  // Handle Delete Device
  if (request.method === 'DELETE') {
      const { id } = request.query;
      if (!id || Array.isArray(id)) return response.status(400).json({ error: 'Invalid ID' });
      
      try {
          await kv.srem('device_ids', id);
          await kv.del(`device:${id}`);
          return response.status(200).json({ ok: true });
      } catch (error) {
          console.error("Delete failed:", error);
          return response.status(500).json({ error: 'Failed to delete' });
      }
  }

  // Handle Get Devices
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Get all device IDs
    const ids = await kv.smembers('device_ids');
    
    if (!ids || ids.length === 0) {
        return response.status(200).json([]);
    }

    // 2. Fetch all device details in parallel
    const pipeline = kv.pipeline();
    ids.forEach(id => pipeline.get(`device:${id}`));
    const results = await pipeline.exec();

    // 3. Map to UI format
    const devices = results.map((data: any) => {
        if (!data) return null;
        
        // Detect OS
        let osType = 'Unknown';
        if (data.osVersion?.toLowerCase().includes('win')) osType = 'Windows';
        else if (data.osVersion?.toLowerCase().includes('mac')) osType = 'macOS';
        else if (data.osVersion?.toLowerCase().includes('nix') || data.osVersion?.toLowerCase().includes('ux')) osType = 'Linux';

        // Calculate Status based on lastSeen (Threshold: 10 minutes)
        const lastSeenDate = new Date(data.lastSeen || 0);
        const diffMinutes = (new Date().getTime() - lastSeenDate.getTime()) / 1000 / 60;
        let status = 'Offline';
        // If seen within last 10 minutes, consider Online
        if (diffMinutes < 10) status = 'Online'; 
        
        return {
            id: data.installId,
            hostname: data.hostname,
            os: osType,
            osVersion: data.osVersion || 'N/A',
            appVersion: data.appVersion || '1.0.0',
            ipAddress: data.ipv4 || '0.0.0.0',
            lastSeen: data.lastSeen || new Date().toISOString(),
            status: status, 
            userId: data.userId || data.installId.substring(0, 5),
            userName: data.userName || 'System User' 
        };
    })
    .filter(Boolean)
    // Sort by last seen (newest first)
    .sort((a: any, b: any) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

    return response.status(200).json(devices);

  } catch (error) {
    console.error("API Error:", error);
    return response.status(500).json({ error: "Internal Server Error" });
  }
}