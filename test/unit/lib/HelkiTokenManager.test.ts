import nock from 'nock';
import { HelkiTokenManager } from '../../../lib/HelkiTokenManager';

const API_BASE = 'https://api-hjm.helki.com';

describe('HelkiTokenManager', () => {
  let manager: HelkiTokenManager;

  beforeEach(() => {
    manager = new HelkiTokenManager(API_BASE);
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('authenticate', () => {
    it('should obtain access token with valid credentials', async () => {
      nock(API_BASE)
        .post('/client/token', 'grant_type=password&username=user%40test.com&password=password123')
        .reply(200, {
          access_token: 'test-token-abc',
          refresh_token: 'refresh-abc',
          expires_in: 14400,
          token_type: 'Bearer',
        });

      const token = await manager.authenticate('user@test.com', 'password123');
      expect(token).toBe('test-token-abc');
      expect(manager.isAuthenticated()).toBe(true);
    });

    it('should throw on invalid credentials (401)', async () => {
      nock(API_BASE).post('/client/token').reply(401);

      await expect(
        manager.authenticate('bad@test.com', 'wrong')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw on network failure', async () => {
      nock(API_BASE)
        .post('/client/token')
        .replyWithError({ code: 'ECONNREFUSED' });

      await expect(
        manager.authenticate('user@test.com', 'pass')
      ).rejects.toThrow('Could not connect to HJM cloud');
    });
  });

  describe('getToken', () => {
    it('should return cached token if not expired', async () => {
      nock(API_BASE)
        .post('/client/token')
        .reply(200, {
          access_token: 'cached-token',
          expires_in: 14400,
        });

      await manager.authenticate('user@test.com', 'pass');
      const token = await manager.getToken();
      expect(token).toBe('cached-token');
    });

    it('should refresh token when expired', async () => {
      nock(API_BASE)
        .post('/client/token')
        .reply(200, {
          access_token: 'token-1',
          expires_in: 0, // Immediately expired
        });

      await manager.authenticate('user@test.com', 'pass');

      nock(API_BASE)
        .post('/client/token')
        .reply(200, {
          access_token: 'token-2',
          expires_in: 14400,
        });

      const token = await manager.getToken();
      expect(token).toBe('token-2');
    });
  });

  describe('refresh', () => {
    it('should throw if no credentials are stored', async () => {
      await expect(manager.refresh()).rejects.toThrow(
        'No credentials available'
      );
    });

    it('should deduplicate concurrent refresh calls', async () => {
      nock(API_BASE)
        .post('/client/token')
        .reply(200, {
          access_token: 'initial',
          expires_in: 14400,
        });

      await manager.authenticate('user@test.com', 'pass');
      manager.invalidate();

      nock(API_BASE)
        .post('/client/token')
        .once()
        .reply(200, {
          access_token: 'refreshed',
          expires_in: 14400,
        });

      const [t1, t2] = await Promise.all([
        manager.refresh(),
        manager.refresh(),
      ]);

      expect(t1).toBe('refreshed');
      expect(t2).toBe('refreshed');
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no token is set', () => {
      expect(manager.isAuthenticated()).toBe(false);
    });

    it('should return true when token is valid and not expired', async () => {
      nock(API_BASE)
        .post('/client/token')
        .reply(200, {
          access_token: 'token',
          expires_in: 14400,
        });

      await manager.authenticate('user@test.com', 'pass');
      expect(manager.isAuthenticated()).toBe(true);
    });

    it('should return false when token is expired (BUG-2)', async () => {
      nock(API_BASE)
        .post('/client/token')
        .reply(200, {
          access_token: 'token',
          expires_in: 0, // Immediately expired (expires_in=0 → expiresAt = now - buffer)
        });

      await manager.authenticate('user@test.com', 'pass');
      // With expires_in=0, tokenExpiresAt = Date.now() + 0 - buffer → already in the past
      expect(manager.isAuthenticated()).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('should clear the stored token', async () => {
      nock(API_BASE)
        .post('/client/token')
        .reply(200, {
          access_token: 'token',
          expires_in: 14400,
        });

      await manager.authenticate('user@test.com', 'pass');
      expect(manager.isAuthenticated()).toBe(true);

      manager.invalidate();
      expect(manager.isAuthenticated()).toBe(false);
    });
  });

  describe('setCredentials removed', () => {
    it('should not have a setCredentials method', () => {
      expect((manager as any).setCredentials).toBeUndefined();
    });
  });
});
