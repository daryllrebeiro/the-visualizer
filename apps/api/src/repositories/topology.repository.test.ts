import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import { db } from '../db/index.js';
import { orgRepository } from './org.repository.js';
import { topologyRepository } from './topology.repository.js';
import { userRepository } from './user.repository.js';

describe('TopologyRepository Multi-Tenant Integration Tests', () => {
  let userA: any;
  let userB: any;
  let orgA: any;
  let orgB: any;
  let mockKafkaState: KafkaClusterState;

  beforeAll(async () => {
    // Basic mock Kafka Cluster State
    mockKafkaState = {
      clusterId: 'kafka-cluster-id' as never,
      rngState: 12345,
      brokers: {},
      topics: {},
      consumerGroups: {},
      transactions: {},
      kraft: {
        activeControllerId: null,
        voters: [],
        controllerEpoch: 0,
        metadataOffset: 0,
      },
      tick: 0,
    };
  });

  beforeEach(async () => {
    // Clear tables
    await db.execute(
      sql`TRUNCATE TABLE simulation_replays, topologies, memberships, organizations, users CASCADE`,
    );

    // Create 2 users
    userA = await userRepository.createUser('user-a@tenant.com', 'User A');
    userB = await userRepository.createUser('user-b@tenant.com', 'User B');

    // Create 2 organizations
    orgA = await orgRepository.createOrg('tenant-a', 'Tenant A Org');
    orgB = await orgRepository.createOrg('tenant-b', 'Tenant B Org');

    // Add userA to orgA and userB to orgB as MEMBER
    await orgRepository.addMember(userA.id, orgA.id, 'MEMBER');
    await orgRepository.addMember(userB.id, orgB.id, 'MEMBER');
  });

  it('should allow user in organization to create and retrieve topologies', async () => {
    const topo = await topologyRepository.createTopology(
      orgA.id,
      userA.id,
      'Tenant A Cluster',
      mockKafkaState,
      'Test description',
      'PRIVATE',
    );

    expect(topo.id).toBeDefined();
    expect(topo.name).toBe('Tenant A Cluster');

    const fetched = await topologyRepository.getTopologyById(topo.id, userA.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(topo.id);
  });

  it('should block user in Org B from reading PRIVATE topology of Org A', async () => {
    const topo = await topologyRepository.createTopology(
      orgA.id,
      userA.id,
      'Tenant A Cluster',
      mockKafkaState,
      'Test description',
      'PRIVATE',
    );

    // Fetch as User B (Org B) -> Should return null
    const fetched = await topologyRepository.getTopologyById(topo.id, userB.id);
    expect(fetched).toBeNull();
  });

  it('should allow anyone to read PUBLIC topology of Org A', async () => {
    const topo = await topologyRepository.createTopology(
      orgA.id,
      userA.id,
      'Tenant A Public Cluster',
      mockKafkaState,
      'Test description',
      'PUBLIC',
    );

    // Fetch as User B (Org B) -> Should return the public topology
    const fetched = await topologyRepository.getTopologyById(topo.id, userB.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('Tenant A Public Cluster');

    // Fetch as anonymous user (no user ID) -> Should also allow
    const fetchedAnon = await topologyRepository.getTopologyById(topo.id);
    expect(fetchedAnon).not.toBeNull();
  });

  it('should allow reading UNLISTED topologies only via their share token', async () => {
    const topo = await topologyRepository.createTopology(
      orgA.id,
      userA.id,
      'Tenant A Unlisted Cluster',
      mockKafkaState,
      'Test description',
      'UNLISTED',
    );

    expect(topo.shareToken).not.toBeNull();

    // Fetch by ID as external User B -> Should fail
    const fetchedById = await topologyRepository.getTopologyById(topo.id, userB.id);
    expect(fetchedById).toBeNull();

    // Fetch by Share Token -> Should succeed
    const fetchedByToken = await topologyRepository.getTopologyByShareToken(topo.shareToken!);
    expect(fetchedByToken).not.toBeNull();
    expect(fetchedByToken?.name).toBe('Tenant A Unlisted Cluster');
  });

  it('should prevent user from Org B from updating/deleting topology of Org A', async () => {
    const topo = await topologyRepository.createTopology(
      orgA.id,
      userA.id,
      'Tenant A Cluster',
      mockKafkaState,
      'Test description',
      'PRIVATE',
    );

    // User B attempts to delete Org A's topology -> Should throw auth error
    await expect(topologyRepository.deleteTopology(topo.id, userB.id)).rejects.toThrow(
      'Unauthorized: User does not have modification rights in this organization',
    );

    // User B attempts to update Org A's topology -> Should throw auth error
    await expect(
      topologyRepository.updateTopology(topo.id, userB.id, { name: 'Hacked name' }),
    ).rejects.toThrow('Unauthorized: User does not have modification rights in this organization');
  });
});
