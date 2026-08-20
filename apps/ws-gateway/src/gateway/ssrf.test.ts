import { describe, expect, it } from 'vitest';

import { isIpBlocked, validateHostAndGetIp } from './ssrf.js';

describe('SSRF Protection & IP Blocklist', () => {
  describe('isIpBlocked', () => {
    it('should block loopback and local broadcast addresses', () => {
      expect(isIpBlocked('127.0.0.1')).toBe(true);
      expect(isIpBlocked('127.255.0.1')).toBe(true);
      expect(isIpBlocked('0.0.0.0')).toBe(true);
      expect(isIpBlocked('::1')).toBe(true);
    });

    it('should block RFC 1918 private subnets', () => {
      // Class A
      expect(isIpBlocked('10.0.0.1')).toBe(true);
      expect(isIpBlocked('10.255.255.255')).toBe(true);
      // Class B
      expect(isIpBlocked('172.16.0.1')).toBe(true);
      expect(isIpBlocked('172.31.255.255')).toBe(true);
      // Class C
      expect(isIpBlocked('192.168.1.100')).toBe(true);
    });

    it('should block link-local addresses', () => {
      expect(isIpBlocked('169.254.169.254')).toBe(true);
    });

    it('should allow public internet IP addresses', () => {
      expect(isIpBlocked('8.8.8.8')).toBe(false);
      expect(isIpBlocked('1.1.1.1')).toBe(false);
      expect(isIpBlocked('208.67.222.222')).toBe(false);
    });
  });

  describe('validateHostAndGetIp', () => {
    it('should resolve and validate public hosts', async () => {
      const ip = await validateHostAndGetIp('one.one.one.one');
      expect(ip).toBeDefined();
      expect(isIpBlocked(ip)).toBe(false);
    });

    it('should reject local/loopback hosts', async () => {
      await expect(validateHostAndGetIp('localhost')).rejects.toThrow('blocked');
    });

    it('should reject blocked direct IPs', async () => {
      await expect(validateHostAndGetIp('10.0.0.1')).rejects.toThrow('blocked');
      await expect(validateHostAndGetIp('127.0.0.1')).rejects.toThrow('blocked');
    });
  });
});
