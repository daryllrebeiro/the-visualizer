import type { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type {
  CdnCacheClusterState,
  CdnCacheSimEvent,
  EdgePoPState,
  RegionalCacheState,
} from './cdn-cache-types.js';
import { evaluateEntryFreshness } from './http-cache-semantics.js';

export function createDefaultCdnCacheCluster(clusterId = 'cdn-cluster-1'): CdnCacheClusterState {
  const origin = {
    originId: 'origin-primary-1',
    storage: {
      '/static/banner.jpg': { value: 'JPEG_IMG_V1', etag: 'w/banner-v1', lastModifiedTick: 0 },
      '/app.js': { value: 'BUNDLE_JS_V1', etag: 'w/app-v1', lastModifiedTick: 0 },
      '/api/config': { value: '{"feature_flag": true}', etag: 'w/cfg-v1', lastModifiedTick: 0 },
    },
    totalRequestsReceived: 0,
    activeInFlightFetches: 0,
  };

  const regionalTiers: Record<string, RegionalCacheState> = {
    'reg-us': {
      tierId: 'reg-us',
      region: 'US',
      cache: {},
      inFlightRequests: {},
      totalHits: 0,
      totalMisses: 0,
    },
    'reg-eu': {
      tierId: 'reg-eu',
      region: 'EU',
      cache: {},
      inFlightRequests: {},
      totalHits: 0,
      totalMisses: 0,
    },
    'reg-ap': {
      tierId: 'reg-ap',
      region: 'AP',
      cache: {},
      inFlightRequests: {},
      totalHits: 0,
      totalMisses: 0,
    },
  };

  const edgePops: Record<string, EdgePoPState> = {
    'pop-us-east': {
      popId: 'pop-us-east',
      region: 'US_EAST',
      regionalTierId: 'reg-us',
      status: 'ONLINE',
      cache: {},
      inFlightRequests: {},
      totalHits: 0,
      totalMisses: 0,
      totalStaleServed: 0,
    },
    'pop-us-west': {
      popId: 'pop-us-west',
      region: 'US_WEST',
      regionalTierId: 'reg-us',
      status: 'ONLINE',
      cache: {},
      inFlightRequests: {},
      totalHits: 0,
      totalMisses: 0,
      totalStaleServed: 0,
    },
    'pop-eu-west': {
      popId: 'pop-eu-west',
      region: 'EU_WEST',
      regionalTierId: 'reg-eu',
      status: 'ONLINE',
      cache: {},
      inFlightRequests: {},
      totalHits: 0,
      totalMisses: 0,
      totalStaleServed: 0,
    },
    'pop-ap-south': {
      popId: 'pop-ap-south',
      region: 'AP_SOUTH',
      regionalTierId: 'reg-ap',
      status: 'ONLINE',
      cache: {},
      inFlightRequests: {},
      totalHits: 0,
      totalMisses: 0,
      totalStaleServed: 0,
    },
  };

  return {
    clusterId,
    tick: 0,
    coalescingEnabled: true,
    defaultMaxAgeTicks: 10,
    defaultStaleWhileRevalidateTicks: 10,
    origin,
    regionalTiers,
    edgePops,
    purges: [],
    recentRequestLogs: [],
    flawsDemonstrated: {
      cacheStampedeOriginSpikeDetected: false,
      excessiveStalenessViolation: false,
    },
  };
}

function resolveNearestPoP(
  state: CdnCacheClusterState,
  region: 'US_EAST' | 'US_WEST' | 'EU_WEST' | 'AP_SOUTH',
): EdgePoPState | undefined {
  const popMap: Record<string, string> = {
    US_EAST: 'pop-us-east',
    US_WEST: 'pop-us-west',
    EU_WEST: 'pop-eu-west',
    AP_SOUTH: 'pop-ap-south',
  };

  const primaryPopId = popMap[region] ?? 'pop-us-east';
  const primaryPop = state.edgePops[primaryPopId];
  if (primaryPop && primaryPop.status === 'ONLINE') {
    return primaryPop;
  }

  // Failover to any available online PoP
  return Object.values(state.edgePops).find((p) => p.status === 'ONLINE');
}

export function pureCdnCacheTransition(
  state: CdnCacheClusterState,
  event: CdnCacheSimEvent,
  _rng: DeterministicRNG,
): { nextState: CdnCacheClusterState; emittedEvents: CdnCacheSimEvent[] } {
  const nextState: CdnCacheClusterState = JSON.parse(JSON.stringify(state)) as CdnCacheClusterState;
  nextState.tick = event.tick;

  switch (event.type) {
    case 'CDN_REQUEST': {
      const { key, clientRegion = 'US_EAST', bypassCache = false } = event.payload;
      const pop = resolveNearestPoP(nextState, clientRegion);
      if (!pop) break;

      const regTier = nextState.regionalTiers[pop.regionalTierId];
      const entry = pop.cache[key];
      const freshness = bypassCache
        ? 'EXPIRED_OR_PURGED'
        : evaluateEntryFreshness(entry, event.tick);

      if (freshness === 'FRESH' && entry) {
        pop.totalHits += 1;
        nextState.recentRequestLogs.push({
          id: event.id,
          key,
          clientRegion,
          edgePopId: pop.popId,
          servedFrom: 'EDGE_HIT',
          coalesced: false,
          tick: event.tick,
        });
      } else if (freshness === 'STALE_WHILE_REVALIDATE' && entry) {
        // RFC 5861: Serve stale immediately to client, trigger background revalidation
        pop.totalStaleServed += 1;
        entry.isRevalidating = true;

        // Async revalidation to origin
        const originObj = nextState.origin.storage[key];
        if (originObj) {
          entry.value = originObj.value;
          entry.etag = originObj.etag;
          entry.cachedAtTick = event.tick;
          entry.isRevalidating = false;
        }

        nextState.recentRequestLogs.push({
          id: event.id,
          key,
          clientRegion,
          edgePopId: pop.popId,
          servedFrom: 'EDGE_STALE_WHILE_REVALIDATE',
          coalesced: false,
          tick: event.tick,
        });
      } else {
        // Hard cache miss at edge
        pop.totalMisses += 1;

        // Check request coalescing at Edge
        const isCoalesced = (pop.inFlightRequests[key] ?? 0) > 0 && nextState.coalescingEnabled;
        if (isCoalesced) {
          pop.inFlightRequests[key] = (pop.inFlightRequests[key] ?? 0) + 1;
          nextState.recentRequestLogs.push({
            id: event.id,
            key,
            clientRegion,
            edgePopId: pop.popId,
            servedFrom: 'ORIGIN_FETCH',
            coalesced: true,
            tick: event.tick,
          });
          break;
        }

        pop.inFlightRequests[key] = 1;

        // Check Regional Tier
        let servedTier: 'REGIONAL_HIT' | 'ORIGIN_FETCH' = 'ORIGIN_FETCH';
        const regEntry = regTier?.cache[key];
        const regFreshness = evaluateEntryFreshness(regEntry, event.tick);

        let resolvedValue = '';
        let resolvedEtag = '';

        if (regFreshness === 'FRESH' && regEntry) {
          regTier!.totalHits += 1;
          servedTier = 'REGIONAL_HIT';
          resolvedValue = regEntry.value;
          resolvedEtag = regEntry.etag;
        } else {
          // Regional Miss -> Origin fetch
          if (regTier) regTier.totalMisses += 1;
          nextState.origin.totalRequestsReceived += 1;
          const originObj = nextState.origin.storage[key];
          resolvedValue = originObj?.value ?? 'DEFAULT_PAYLOAD';
          resolvedEtag = originObj?.etag ?? 'w/default';

          if (regTier) {
            regTier.cache[key] = {
              key,
              value: resolvedValue,
              etag: resolvedEtag,
              cachedAtTick: event.tick,
              maxAgeTicks: nextState.defaultMaxAgeTicks,
              staleWhileRevalidateTicks: nextState.defaultStaleWhileRevalidateTicks,
              isStale: false,
              isRevalidating: false,
              purged: false,
            };
          }
        }

        // Store in Edge PoP
        pop.cache[key] = {
          key,
          value: resolvedValue,
          etag: resolvedEtag,
          cachedAtTick: event.tick,
          maxAgeTicks: nextState.defaultMaxAgeTicks,
          staleWhileRevalidateTicks: nextState.defaultStaleWhileRevalidateTicks,
          isStale: false,
          isRevalidating: false,
          purged: false,
        };

        // Reset in-flight count
        delete pop.inFlightRequests[key];

        nextState.recentRequestLogs.push({
          id: event.id,
          key,
          clientRegion,
          edgePopId: pop.popId,
          servedFrom: servedTier,
          coalesced: false,
          tick: event.tick,
        });
      }

      if (nextState.recentRequestLogs.length > 50) {
        nextState.recentRequestLogs.shift();
      }
      break;
    }

    case 'CDN_FLASH_CROWD': {
      const { key, requestCount, clientRegion = 'US_EAST' } = event.payload;
      const pop = resolveNearestPoP(nextState, clientRegion);
      if (!pop) break;

      if (nextState.coalescingEnabled) {
        // With coalescing: 1 request fetches origin, remaining N-1 wait and coalesce
        nextState.origin.totalRequestsReceived += 1;
        pop.totalMisses += 1;
        const originObj = nextState.origin.storage[key];
        const resolvedValue = originObj?.value ?? 'DEFAULT_PAYLOAD';
        const resolvedEtag = originObj?.etag ?? 'w/default';

        pop.cache[key] = {
          key,
          value: resolvedValue,
          etag: resolvedEtag,
          cachedAtTick: event.tick,
          maxAgeTicks: nextState.defaultMaxAgeTicks,
          staleWhileRevalidateTicks: nextState.defaultStaleWhileRevalidateTicks,
          isStale: false,
          isRevalidating: false,
          purged: false,
        };

        nextState.recentRequestLogs.push({
          id: `${event.id}-leader`,
          key,
          clientRegion,
          edgePopId: pop.popId,
          servedFrom: 'ORIGIN_FETCH',
          coalesced: false,
          tick: event.tick,
        });

        for (let i = 1; i < requestCount; i++) {
          nextState.recentRequestLogs.push({
            id: `${event.id}-coalesced-${i}`,
            key,
            clientRegion,
            edgePopId: pop.popId,
            servedFrom: 'ORIGIN_FETCH',
            coalesced: true,
            tick: event.tick,
          });
        }
      } else {
        // Without coalescing: Cache Stampede! All N requests independently dispatch to origin
        nextState.origin.totalRequestsReceived += requestCount;
        pop.totalMisses += requestCount;
        const originObj = nextState.origin.storage[key];
        const resolvedValue = originObj?.value ?? 'DEFAULT_PAYLOAD';
        const resolvedEtag = originObj?.etag ?? 'w/default';

        pop.cache[key] = {
          key,
          value: resolvedValue,
          etag: resolvedEtag,
          cachedAtTick: event.tick,
          maxAgeTicks: nextState.defaultMaxAgeTicks,
          staleWhileRevalidateTicks: nextState.defaultStaleWhileRevalidateTicks,
          isStale: false,
          isRevalidating: false,
          purged: false,
        };

        for (let i = 0; i < requestCount; i++) {
          nextState.recentRequestLogs.push({
            id: `${event.id}-stampede-${i}`,
            key,
            clientRegion,
            edgePopId: pop.popId,
            servedFrom: 'ORIGIN_FETCH',
            coalesced: false,
            tick: event.tick,
          });
        }
        nextState.flawsDemonstrated.cacheStampedeOriginSpikeDetected = true;
      }
      break;
    }

    case 'CDN_PURGE_KEY': {
      const { key } = event.payload;
      const targetPops = Object.keys(nextState.edgePops);

      // Invalidate on edge PoPs and Regional tiers
      for (const pop of Object.values(nextState.edgePops)) {
        if (pop.cache[key]) {
          pop.cache[key]!.purged = true;
        }
      }
      for (const reg of Object.values(nextState.regionalTiers)) {
        if (reg.cache[key]) {
          reg.cache[key]!.purged = true;
        }
      }

      nextState.purges.push({
        id: event.id,
        key,
        initiatedAtTick: event.tick,
        targetPops,
        acknowledgedPops: [...targetPops],
        completed: true,
      });
      break;
    }

    case 'CDN_UPDATE_ORIGIN_OBJECT': {
      const { key, newValue } = event.payload;
      const existing = nextState.origin.storage[key];
      const newVersion = (existing ? parseInt(existing.etag.split('-v')[1] || '1', 10) : 1) + 1;
      nextState.origin.storage[key] = {
        value: newValue,
        etag: `w/${key.replace(/[^a-zA-Z0-9]/g, '')}-v${newVersion}`,
        lastModifiedTick: event.tick,
      };
      break;
    }

    case 'CDN_TOGGLE_POP_STATUS': {
      const { popId, status } = event.payload;
      const pop = nextState.edgePops[popId];
      if (pop) {
        pop.status = status;
      }
      break;
    }

    case 'CDN_UPDATE_CONFIG': {
      const p = event.payload;
      if (p.coalescingEnabled !== undefined) nextState.coalescingEnabled = p.coalescingEnabled;
      if (p.defaultMaxAgeTicks !== undefined) nextState.defaultMaxAgeTicks = p.defaultMaxAgeTicks;
      if (p.defaultStaleWhileRevalidateTicks !== undefined)
        nextState.defaultStaleWhileRevalidateTicks = p.defaultStaleWhileRevalidateTicks;
      break;
    }

    case 'TICK' as any:
    case 'CDN_TICK': {
      // Periodic house-keeping
      break;
    }
  }

  nextState.rngState = _rng.getState();
  return { nextState, emittedEvents: [] };
}
