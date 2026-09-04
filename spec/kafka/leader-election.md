# Specification: Partition Leader Election & Epoch Fencing

**Fidelity Tag**: `Behavioral`  
**Status**: Implemented (`packages/simulation`, `packages/contracts`)

---

## 1. Concept Summary

When a partition's leader broker fails or becomes degraded, a new leader must be elected from the In-Sync Replicas (ISR) set to resume client traffic without uncommitted data loss. The `leaderEpoch` monotonic counter fences stale requests from previously partitioned leaders.

---

## 2. Leader Election Algorithm

```
                  ┌───────────────────────────────┐
                  │ Broker Crashes (Status: CRASH)│
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                     Is this broker a leader
                     for any topic partition?
                                  │
                     ┌────────────┴────────────┐
                 YES │                         │ NO
                     ▼                         ▼
         Filter Active ISR Replicas:       (No action needed)
     ISR' = { b ∈ ISR | b is ALIVE }
                     │
         ┌───────────┴───────────┐
     ISR' ≠ ∅                    │ ISR' = ∅
         ▼                       ▼
  Elect first replica     Set leader = null
  in ISR' as new Leader   (Partition OFFLINE)
  leaderEpoch += 1        leaderEpoch += 1
  ISR = ISR'
```

---

## 3. Epoch Fencing

- Every successful election increments `leaderEpoch` by 1.
- Any client or follower request specifying an obsolete `leaderEpoch` is fenced to avoid split-brain log divergent writes.
