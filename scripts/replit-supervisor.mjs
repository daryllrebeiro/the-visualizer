#!/usr/bin/env node

/**
 * TheVisualizer — Replit Multi-Process Supervisor
 * Manages and monitors API (3000), WS-Gateway (3001), Web (3002), and Ingress Proxy (8080)
 * inside a single Reserved VM.
 */

import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PROXY_PORT = process.env.PORT || process.env.PROXY_PORT || '8080';
const API_PORT = process.env.API_PORT || '3000';
const WS_PORT = process.env.WS_GATEWAY_PORT || '3001';
const WEB_PORT = process.env.WEB_PORT || '3002';

// Ensure standard fallback secrets for local dry runs if not set
const DEFAULT_SECRET = 'super-secret-key-that-is-at-least-32-chars-long';
const redisPassword = process.env.REDIS_PASSWORD || 'redis_local_secret';
let redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
if (redisPassword && !redisUrl.includes('@')) {
  redisUrl = redisUrl.replace('redis://', `redis://:${redisPassword}@`);
}

const baseEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'production',
  SESSION_SECRET: process.env.SESSION_SECRET || DEFAULT_SECRET,
  JWT_SECRET: process.env.JWT_SECRET || process.env.SESSION_SECRET || DEFAULT_SECRET,
  REDIS_PASSWORD: redisPassword,
  REDIS_URL: redisUrl,
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://visualizer_user:visualizer_password@127.0.0.1:5432/visualizer_db',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*',
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('  THE VISUALIZER — Replit Multi-Process Supervisor');
console.log(`  Ingress Proxy:    0.0.0.0:${PROXY_PORT} (External HTTP/WS Entrypoint)`);
console.log(`  Stateless API:    127.0.0.1:${API_PORT}`);
console.log(`  WS Gateway:       127.0.0.1:${WS_PORT}`);
console.log(`  Next.js Web:      127.0.0.1:${WEB_PORT}`);
console.log('═══════════════════════════════════════════════════════════════\n');

const services = [
  {
    name: 'api',
    color: '\x1b[32m', // green
    cmd: 'node',
    args: ['dist/index.js'],
    cwd: path.join(rootDir, 'apps', 'api'),
    env: { ...baseEnv, PORT: API_PORT },
  },
  {
    name: 'ws-gateway',
    color: '\x1b[35m', // magenta
    cmd: 'node',
    args: ['dist/index.js'],
    cwd: path.join(rootDir, 'apps', 'ws-gateway'),
    env: { ...baseEnv, PORT: WS_PORT },
  },
  {
    name: 'web',
    color: '\x1b[34m', // blue
    cmd: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['--filter', '@the-visualizer/web', 'start'],
    cwd: rootDir,
    env: { ...baseEnv, PORT: WEB_PORT },
  },
  {
    name: 'proxy',
    color: '\x1b[36m', // cyan
    cmd: 'node',
    args: ['scripts/replit-reverse-proxy.mjs'],
    cwd: rootDir,
    env: {
      ...baseEnv,
      PORT: PROXY_PORT,
      PROXY_PORT,
      API_PORT,
      WS_GATEWAY_PORT: WS_PORT,
      WEB_PORT,
    },
  },
];

const runningProcesses = new Map();
let isShuttingDown = false;

function prefixLog(color, tag, data) {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim().length > 0) {
      console.log(`${color}[${tag}]\x1b[0m ${line}`);
    }
  }
}

function startService(service) {
  const isCmdBatch = typeof service.cmd === 'string' && (service.cmd.endsWith('.cmd') || service.cmd.endsWith('.bat'));
  const child = spawn(service.cmd, service.args, {
    cwd: service.cwd,
    env: service.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isCmdBatch,
  });

  runningProcesses.set(service.name, child);

  child.stdout.on('data', (data) => prefixLog(service.color, service.name, data));
  child.stderr.on('data', (data) => prefixLog(service.color, service.name, data));

  child.on('exit', (code, signal) => {
    runningProcesses.delete(service.name);
    console.log(
      `${service.color}[${service.name}]\x1b[0m exited with code ${code !== null ? code : signal}`,
    );

    if (!isShuttingDown) {
      // If critical service crashes during run, trigger supervisor shutdown
      if (code !== 0) {
        console.error(
          `\x1b[31m[supervisor]\x1b[0m Critical service ${service.name} failed! Terminating remaining services.`,
        );
        stopAll(code || 1);
      }
    }
  });

  return child;
}

function stopAll(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\n\x1b[33m[supervisor]\x1b[0m Initiating graceful shutdown of all processes...');

  for (const [name, child] of runningProcesses.entries()) {
    console.log(`\x1b[33m[supervisor]\x1b[0m Sending SIGTERM to ${name} (PID ${child.pid})...`);
    child.kill('SIGTERM');
  }

  // Allow up to 8 seconds for graceful cleanup, then SIGKILL
  const forceKillTimeout = setTimeout(() => {
    for (const [name, child] of runningProcesses.entries()) {
      console.log(`\x1b[31m[supervisor]\x1b[0m Force killing ${name} (PID ${child.pid})...`);
      child.kill('SIGKILL');
    }
    process.exit(exitCode);
  }, 8000);

  // Poll until all exited
  const checkInterval = setInterval(() => {
    if (runningProcesses.size === 0) {
      clearTimeout(forceKillTimeout);
      clearInterval(checkInterval);
      console.log('\x1b[32m[supervisor]\x1b[0m All processes terminated cleanly. Exiting.');
      process.exit(exitCode);
    }
  }, 200);
}

// Start all services
for (const svc of services) {
  startService(svc);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
