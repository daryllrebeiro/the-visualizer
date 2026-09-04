# Production Hosting & Deployment Architecture Guide

This guide describes production deployment options, architecture blueprints, environment setups, and scaling patterns for **The Visualizer**.

---

## 1. System Architecture Overview

```text
                           ┌───────────────────────────┐
                           │   Internet / Cloudflare   │
                           │   (SSL / DDoS Protection) │
                           └─────────────┬─────────────┘
                                         │
                                         ▼
                           ┌───────────────────────────┐
                           │  Reverse Proxy / Ingress  │
                           │     (NGINX / AWS ALB)     │
                           └───────┬───────────┬───────┘
                                   │           │
                     ┌─────────────┘           └─────────────┐
                     │ (HTTP: /api/*)                        │ (WebSocket: /ws/*)
                     ▼                                       ▼
       ┌───────────────────────────┐           ┌───────────────────────────┐
       │   apps/api (Hono REST)    │           │  apps/ws-gateway (Node)   │
       │   Stateless, Auto-Scaled  │           │  Stateful Sim Sessions    │
       └─────────────┬─────────────┘           └─────────────┬─────────────┘
                     │                                       │
                     │         ┌───────────────────┐         │
                     └────────►│  Managed Redis 7  │◄────────┘
                               │  (State & PubSub) │
                               └─────────┬─────────┘
                                         │
                                         ▼
                               ┌───────────────────┐
                               │  PostgreSQL 16    │
                               │  (Topology Store) │
                               └───────────────────┘
```

---

## 2. Deployment Strategies

### Strategy A: Self-Hosted Docker Compose (Single VM / Droplet)

Ideal for single-server production hosting (e.g. AWS EC2, DigitalOcean Droplet, Hetzner, GCP Compute Engine).

#### Step 1: Provision Server & Security Groups

- Inbound ports: `80` (HTTP), `443` (HTTPS).
- Internal ports: `3000`, `3001`, `3002`, `5432`, `6379` (blocked from public access).

#### Step 2: Configure Production `.env`

Create `.env.production` on the host:

```env
PORT=3000
DATABASE_URL=postgresql://visualizer_user:SECURE_POSTGRES_PASSWORD@postgres:5432/visualizer_db
REDIS_URL=redis://:SECURE_REDIS_PASSWORD@redis:6379
SESSION_SECRET=GENERATE_64_CHAR_RANDOM_SECRET_KEY
ALLOWED_ORIGINS=https://visualizer.yourdomain.com
NEXT_PUBLIC_API_URL=https://visualizer.yourdomain.com/api
NEXT_PUBLIC_WS_URL=wss://visualizer.yourdomain.com/ws
```

#### Step 3: Run with Docker Compose

```bash
docker compose -f docker-compose.yml up --build -d
```

#### Step 4: Configure NGINX Reverse Proxy with SSL (Certbot)

```nginx
server {
    server_name visualizer.yourdomain.com;

    # Next.js Web Client
    location / {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # REST API
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket Gateway (Upgrades & Long-Lived Connections)
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/visualizer.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/visualizer.yourdomain.com/privkey.pem;
}
```

---

### Strategy B: Cloud-Native Managed Deployment (AWS / GCP)

| Component                                 | AWS Cloud Blueprint                     | GCP Cloud Blueprint             |
| :---------------------------------------- | :-------------------------------------- | :------------------------------ |
| **Frontend (`apps/web`)**                 | AWS Amplify / Vercel / CloudFront + S3  | Cloud Run / Firebase Hosting    |
| **REST API (`apps/api`)**                 | AWS ECS Fargate / App Runner            | Cloud Run (Stateless container) |
| **WebSocket Gateway (`apps/ws-gateway`)** | AWS ECS Fargate (Network Load Balancer) | Cloud Run (WebSockets enabled)  |
| **Database**                              | AWS RDS PostgreSQL 16 (Multi-AZ)        | GCP Cloud SQL PostgreSQL 16     |
| **Cache & Pub/Sub**                       | AWS ElastiCache for Redis 7             | GCP Memorystore for Redis 7     |

---

## 3. High Availability & Scaling Considerations

1. **WebSocket Session Distribution**:
   - `apps/ws-gateway` nodes communicate via Redis Pub/Sub (`room:<roomId>:events`).
   - Multiple gateway pods can run concurrently behind a load balancer with sticky IP routing or Redis PubSub backplane.
2. **Database Connection Pooling**:
   - For PostgreSQL, use PgBouncer or AWS RDS Proxy to manage connection spikes under heavy user load.
3. **Health Checks & Auto-Recovery**:
   - `apps/api`: `GET /health` (Returns `200 OK` with database status).
   - `apps/ws-gateway`: `GET /health` (Returns `200 OK` with active session counts).
4. **Monitoring & Alerting**:
   - Prometheus metrics endpoint at `/metrics` exporting:
     - `sim_active_sessions`: Active simulation rooms
     - `sim_ticks_processed_total`: Real-time tick throughput
     - `sim_queue_size`: Redis intents backlog
     - `sim_invariant_violations_total`: Safety invariant trip alarms
