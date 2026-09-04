import { check, sleep } from 'k6';
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '10s', target: 10 }, // Ramp-up to 10 users
    { duration: '20s', target: 50 }, // Scale to 50 users
    { duration: '10s', target: 0 }, // Ramp-down to 0
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'], // Error rate less than 1%
    http_req_duration: ['p(95)<300'], // 95% of requests must complete under 300ms
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

export default function () {
  // 1. Hit API health endpoint
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'status is 200': (r) => r.status === 200,
    'status reports UP': (r) => r.json().status === 'UP',
  });

  sleep(1);

  // 2. Hit public share topologies lookup endpoint
  // Use a mock 32-character alphanumeric share token
  const shareToken = '1234567890abcdef1234567890abcdef';
  const shareRes = http.get(`${BASE_URL}/topologies/share/${shareToken}`);
  check(shareRes, {
    'share token returns 404 or 200': (r) => r.status === 404 || r.status === 200,
    'latency is low': (r) => r.timings.duration < 100,
  });

  sleep(1);
}
