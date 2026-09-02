# TheVisualizer — Design System & CanvasShell Documentation

**Package:** `@the-visualizer/ui`  
**Status:** Implemented in Phase 1  
**Reference Route:** `/design-system`

---

## 1. Design Tokens & Color Accents

Every domain visualizer implements a standardized design theme with domain-specific accent colors:

| Domain | Key | Primary Color | Visual Role |
|---|---|---|---|
| **Apache Kafka** | `kafka` | `#10b981` (Emerald) | Partition streams & KRaft epochs |
| **Raft Consensus** | `raft` | `#8b5cf6` (Purple) | Quorum votes & log terms |
| **Distributed DB** | `database` | `#ec4899` (Pink) | 360° Token ring & consistency quorums |
| **Redis Cluster** | `redis` | `#ef4444` (Red) | 16,384 Hash slots & eviction pressure |
| **Kubernetes** | `kubernetes` | `#3b82f6` (Blue) | Pod racks & controller reconciliation |
| **RabbitMQ** | `rabbitmq` | `#f97316` (Orange) | AMQP exchanges, bindings & DLQ |
| **Storage Engine** | `storage` | `#14b8a6` (Teal) | B+Tree balancing & LSM compactions |
| **TCP Networking** | `networking` | `#06b6d4` (Cyan) | Sliding windows & AIMD curves |

---

## 2. Core Primitive Components

All primitives are exported from `@the-visualizer/ui`:

```typescript
import {
  Button,
  IconButton,
  Badge,
  StatusPill,
  Card,
  EmptyState,
  Skeleton,
  Toggle,
  Slider,
  Select,
  Tooltip,
  Modal,
  Drawer,
  Tabs,
  ProgressRing,
  Gauge,
  CommandPalette,
  CanvasShell,
} from '@the-visualizer/ui';
```

### Component Guidelines:
- **`Button` & `IconButton`**: Sizing (`sm`, `md`, `lg`), loading spinner states, and `variant="domain"` with automatic gradient accenting.
- **`Badge` & `StatusPill`**: Semantic status indicators (`CONNECTED`, `SANDBOX`, `ERROR`) with pulsing status dots.
- **`ProgressRing` & `Gauge`**: Real-time capacity indicators with linear and radial SVG transitions.
- **`Drawer` & `Modal`**: Accessible overlay dialogs with `Escape` key handlers and backdrop filters.
- **`Tabs`**: Segmented or underline navigation tabs for entity inspectors.
- **`CommandPalette` (`⌘K` / `Ctrl+K`)**: Keyboard-navigable quick jump for switching domains, running chaos actions, and executing scenarios.

---

## 3. Application Layout (`CanvasShell`)

The `CanvasShell` component unifies all 8 domain routes:

```tsx
<CanvasShell
  currentDomain="kafka"
  domains={DomainRegistry.list()}
  onSelectDomain={(id) => router.push(`/${id}`)}
  status="CONNECTED"
  leftPanel={<ChaosControls />}
  rightPanel={<EntityInspector />}
  bottomBar={<TimelineScrubber />}
>
  <KafkaCanvas />
</CanvasShell>
```
