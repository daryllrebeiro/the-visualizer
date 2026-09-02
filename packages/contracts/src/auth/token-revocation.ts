/**
 * Token Revocation Store
 * Tracks revoked JWT tokens (via logout, administrative revocation, or session invalidation).
 * Provides an in-memory TTL-bounded store with optional external backend integration.
 */

class TokenRevocationManager {
  private revokedTokens = new Map<string, number>(); // token -> expiresAtTimestampMs

  /**
   * Mark a token as revoked.
   * @param token The raw JWT or token signature hash to revoke
   * @param ttlSeconds Time-to-live in seconds until token naturally expires (default 7 days)
   */
  async revoke(token: string, ttlSeconds: number = 7 * 24 * 3600): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.revokedTokens.set(token, expiresAt);
    this.cleanup();
  }

  /**
   * Check if a token has been revoked.
   */
  async isRevoked(token: string): Promise<boolean> {
    const expiresAt = this.revokedTokens.get(token);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.revokedTokens.delete(token);
      return false;
    }
    return true;
  }

  /**
   * Purge all expired tokens from the revocation map.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [token, expiresAt] of this.revokedTokens.entries()) {
      if (now > expiresAt) {
        this.revokedTokens.delete(token);
      }
    }
  }

  /**
   * Clear all records (testing helper).
   */
  clear(): void {
    this.revokedTokens.clear();
  }
}

export const tokenRevocationStore = new TokenRevocationManager();
