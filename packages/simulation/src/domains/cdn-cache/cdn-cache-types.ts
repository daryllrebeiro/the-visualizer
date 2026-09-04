/**
 * CDN & Multi-Tier Caching Simulation Types & State Model
 *
 * References:
 * - RFC 9111: HTTP Caching (max-age, stale-while-revalidate, ETag / If-None-Match)
 * - RFC 5861: HTTP Cache-Control Extensions for Stale Content
 * - Cloudflare / Fastly Tiered Cache Architectures
 */

export interface CacheEntry {
  key: string;
  value: string;
  etag: string;
  cachedAtTick: number;
  maxAgeTicks: number;
  staleWhileRevalidateTicks: number;
  isStale: boolean;
  isRevalidating: boolean;
  purged: boolean;
}

export interface EdgePoPState {
  popId: string;
  region: 'US_EAST' | 'US_WEST' | 'EU_WEST' | 'AP_SOUTH';
  regionalTierId: string;
  status: 'ONLINE' | 'OFFLINE';
  cache: Record<string, CacheEntry>;
  inFlightRequests: Record<string, number>; // key -> count of coalesced requests
  totalHits: number;
  totalMisses: number;
  totalStaleServed: number;
}

export interface RegionalCacheState {
  tierId: string;
  region: 'US' | 'EU' | 'AP';
  cache: Record<string, CacheEntry>;
  inFlightRequests: Record<string, number>;
  totalHits: number;
  totalMisses: number;
}

export interface OriginServerState {
  originId: string;
  storage: Record<string, { value: string; etag: string; lastModifiedTick: number }>;
  totalRequestsReceived: number;
  activeInFlightFetches: number;
}

export interface PurgeOperation {
  id: string;
  key: string;
  initiatedAtTick: number;
  targetPops: string[];
  acknowledgedPops: string[];
  completed: boolean;
}

export interface CdnCacheClusterState {
  clusterId: string;
  tick: number;
  rngState?: number;
  coalescingEnabled: boolean;
  defaultMaxAgeTicks: number;
  defaultStaleWhileRevalidateTicks: number;
  origin: OriginServerState;
  regionalTiers: Record<string, RegionalCacheState>;
  edgePops: Record<string, EdgePoPState>;
  purges: PurgeOperation[];
  recentRequestLogs: Array<{
    id: string;
    key: string;
    clientRegion: string;
    edgePopId: string;
    servedFrom: 'EDGE_HIT' | 'EDGE_STALE_WHILE_REVALIDATE' | 'REGIONAL_HIT' | 'ORIGIN_FETCH';
    coalesced: boolean;
    tick: number;
  }>;
  flawsDemonstrated: {
    cacheStampedeOriginSpikeDetected: boolean;
    excessiveStalenessViolation: boolean;
  };
}

export type CdnCacheSimEvent =
  | {
      id: string;
      tick: number;
      type: 'CDN_REQUEST';
      payload: {
        key: string;
        clientRegion?: 'US_EAST' | 'US_WEST' | 'EU_WEST' | 'AP_SOUTH';
        bypassCache?: boolean;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'CDN_FLASH_CROWD';
      payload: {
        key: string;
        requestCount: number;
        clientRegion?: 'US_EAST' | 'US_WEST' | 'EU_WEST' | 'AP_SOUTH';
      };
    }
  | {
      id: string;
      tick: number;
      type: 'CDN_PURGE_KEY';
      payload: {
        key: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'CDN_UPDATE_ORIGIN_OBJECT';
      payload: {
        key: string;
        newValue: string;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'CDN_TOGGLE_POP_STATUS';
      payload: {
        popId: string;
        status: 'ONLINE' | 'OFFLINE';
      };
    }
  | {
      id: string;
      tick: number;
      type: 'CDN_UPDATE_CONFIG';
      payload: {
        coalescingEnabled?: boolean;
        defaultMaxAgeTicks?: number;
        defaultStaleWhileRevalidateTicks?: number;
      };
    }
  | {
      id: string;
      tick: number;
      type: 'CDN_TICK';
      payload: Record<string, unknown>;
    };
