'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ChatPresenceInvariantChecker,
  ConsistentHashingInvariantChecker,
  createDefaultChatPresenceCluster,
  createDefaultConsistentHashingCluster,
  createDefaultFeatureStoreCluster,
  createDefaultLBCluster,
  createDefaultLlmEvalCluster,
  createDefaultMerkleTreesCluster,
  createDefaultModelRolloutCluster,
  createDefaultProbabilisticStructuresCluster,
  createDefaultSearchIndexCluster,
  createDefaultTaskSchedulerCluster,
  DeterministicRNG,
  FeatureStoreInvariantChecker,
  LBInvariantChecker,
  LlmEvalInvariantChecker,
  MerkleTreesInvariantChecker,
  ModelRolloutInvariantChecker,
  pureChatPresenceTransition,
  pureConsistentHashingTransition,
  pureFeatureStoreTransition,
  pureLBTransition,
  pureLlmEvalTransition,
  pureMerkleTreesTransition,
  pureModelRolloutTransition,
  pureProbabilisticStructuresTransition,
  pureSearchIndexTransition,
  pureTaskSchedulerTransition,
  ProbabilisticStructuresInvariantChecker,
  SearchIndexInvariantChecker,
  TaskSchedulerInvariantChecker,
  type ChatPresenceClusterState,
  type ChatPresenceSimEvent,
  type ConsistentHashingClusterState,
  type ConsistentHashingSimEvent,
  type FeatureStoreClusterState,
  type FeatureStoreSimEvent,
  type LBClusterState,
  type LBSimEvent,
  type LlmEvalClusterState,
  type LlmEvalSimEvent,
  type MerkleTreesClusterState,
  type MerkleTreesSimEvent,
  type ModelRolloutClusterState,
  type ModelRolloutSimEvent,
  type ProbabilisticStructuresClusterState,
  type ProbabilisticStructuresSimEvent,
  type SearchIndexClusterState,
  type SearchIndexSimEvent,
  type TaskSchedulerClusterState,
  type TaskSchedulerSimEvent,
} from '@the-visualizer/simulation';

import { ChatPresenceVisualizer } from '../chat-presence/ChatPresenceVisualizer';
import { ConsistentHashingVisualizer } from '../consistent-hashing/ConsistentHashingVisualizer';
import { FeatureStoreVisualizer } from '../feature-store/FeatureStoreVisualizer';
import { LlmEvalVisualizer } from '../llm-eval/LlmEvalVisualizer';
import { LoadBalancerVisualizer } from '../load-balancer/LoadBalancerVisualizer';
import { MerkleTreesVisualizer } from '../merkle-trees/MerkleTreesVisualizer';
import { ModelRolloutVisualizer } from '../model-rollout/ModelRolloutVisualizer';
import { ProbabilisticStructuresVisualizer } from '../probabilistic-structures/ProbabilisticStructuresVisualizer';
import { SearchIndexVisualizer } from '../search-index/SearchIndexVisualizer';
import { TaskSchedulerVisualizer } from '../task-scheduler/TaskSchedulerVisualizer';

export type NewDomainId =
  | 'load-balancer'
  | 'search-index'
  | 'task-scheduler'
  | 'chat-presence'
  | 'feature-store'
  | 'model-rollout'
  | 'llm-eval'
  | 'consistent-hashing'
  | 'probabilistic-structures'
  | 'merkle-trees';

export interface NewDomainsPanelProps {
  domainId: NewDomainId;
  isPaused: boolean;
  onHalt: (message: string) => void;
}

/** Domains whose heartbeat TICK advances mechanics (drains, health, sync). */
const TICK_DRIVEN: ReadonlySet<NewDomainId> = new Set([
  'load-balancer',
  'task-scheduler',
  'chat-presence',
  'feature-store',
  'model-rollout',
]);

export function NewDomainsPanel({ domainId, isPaused, onHalt }: NewDomainsPanelProps): React.JSX.Element {
  const [lbState, setLbState] = useState<LBClusterState>(() => createDefaultLBCluster());
  const [searchState, setSearchState] = useState<SearchIndexClusterState>(() => createDefaultSearchIndexCluster());
  const [schedState, setSchedState] = useState<TaskSchedulerClusterState>(() => createDefaultTaskSchedulerCluster());
  const [chatState, setChatState] = useState<ChatPresenceClusterState>(() => createDefaultChatPresenceCluster());
  const [fsState, setFsState] = useState<FeatureStoreClusterState>(() => createDefaultFeatureStoreCluster());
  const [rollState, setRollState] = useState<ModelRolloutClusterState>(() => createDefaultModelRolloutCluster());
  const [evalState, setEvalState] = useState<LlmEvalClusterState>(() => createDefaultLlmEvalCluster());
  const [chashState, setChashState] = useState<ConsistentHashingClusterState>(() => createDefaultConsistentHashingCluster());
  const [probState, setProbState] = useState<ProbabilisticStructuresClusterState>(() => createDefaultProbabilisticStructuresCluster());
  const [merkleState, setMerkleState] = useState<MerkleTreesClusterState>(() => createDefaultMerkleTreesCluster());

  const rngRef = useRef<DeterministicRNG>(new DeterministicRNG(42));

  const checkers = useMemo(
    () => ({
      'load-balancer': new LBInvariantChecker(),
      'search-index': new SearchIndexInvariantChecker(),
      'task-scheduler': new TaskSchedulerInvariantChecker(),
      'chat-presence': new ChatPresenceInvariantChecker(),
      'feature-store': new FeatureStoreInvariantChecker(),
      'model-rollout': new ModelRolloutInvariantChecker(),
      'llm-eval': new LlmEvalInvariantChecker(),
      'consistent-hashing': new ConsistentHashingInvariantChecker(),
      'probabilistic-structures': new ProbabilisticStructuresInvariantChecker(),
      'merkle-trees': new MerkleTreesInvariantChecker(),
    }),
    [],
  );

  const haltRef = useRef(onHalt);
  haltRef.current = onHalt;

  // Generic tick loop for the active tick-driven domain.
  useEffect(() => {
    if (!TICK_DRIVEN.has(domainId) || isPaused) return;
    const interval = setInterval(() => {
      const rng = rngRef.current;
      switch (domainId) {
        case 'load-balancer':
          setLbState((prev) => {
            const res = pureLBTransition(prev, { id: `tick-${prev.tick + 1}`, tick: prev.tick + 1, type: 'LB_TICK', payload: {} }, rng);
            const v = checkers[domainId].check(res.nextState);
            if (v) haltRef.current(`[LB ${v.ruleId}] ${v.description}`);
            return res.nextState;
          });
          break;
        case 'task-scheduler':
          setSchedState((prev) => {
            const res = pureTaskSchedulerTransition(prev, { id: `tick-${prev.tick + 1}`, tick: prev.tick + 1, type: 'SCHED_TICK', payload: {} }, rng);
            const v = checkers[domainId].check(res.nextState);
            if (v) haltRef.current(`[SCHED ${v.ruleId}] ${v.description}`);
            return res.nextState;
          });
          break;
        case 'chat-presence':
          setChatState((prev) => {
            const res = pureChatPresenceTransition(prev, { id: `tick-${prev.tick + 1}`, tick: prev.tick + 1, type: 'CHAT_TICK', payload: {} }, rng);
            const v = checkers[domainId].check(res.nextState);
            if (v) haltRef.current(`[CHAT ${v.ruleId}] ${v.description}`);
            return res.nextState;
          });
          break;
        case 'feature-store':
          setFsState((prev) => {
            const res = pureFeatureStoreTransition(prev, { id: `tick-${prev.tick + 1}`, tick: prev.tick + 1, type: 'FS_TICK', payload: {} }, rng);
            const v = checkers[domainId].check(res.nextState);
            if (v) haltRef.current(`[FS ${v.ruleId}] ${v.description}`);
            return res.nextState;
          });
          break;
        case 'model-rollout':
          setRollState((prev) => {
            const res = pureModelRolloutTransition(prev, { id: `tick-${prev.tick + 1}`, tick: prev.tick + 1, type: 'ROLL_TICK', payload: {} }, rng);
            const v = checkers[domainId].check(res.nextState);
            if (v) haltRef.current(`[ROLL ${v.ruleId}] ${v.description}`);
            return res.nextState;
          });
          break;
      }
    }, 300);
    return () => clearInterval(interval);
  }, [domainId, isPaused, checkers]);

  const dispatchLB = useCallback(
    (event: LBSimEvent) => {
      setLbState((prev) => {
        const res = pureLBTransition(prev, event, rngRef.current);
        const v = checkers['load-balancer'].check(res.nextState);
        if (v) haltRef.current(`[LB ${v.ruleId}] ${v.description}`);
        return res.nextState;
      });
    },
    [checkers],
  );
  const dispatchSearch = useCallback(
    (event: SearchIndexSimEvent) => {
      setSearchState((prev) => {
        const res = pureSearchIndexTransition(prev, event, rngRef.current);
        const v = checkers['search-index'].check(res.nextState);
        if (v) haltRef.current(`[SEARCH ${v.ruleId}] ${v.description}`);
        return res.nextState;
      });
    },
    [checkers],
  );
  const dispatchSched = useCallback(
    (event: TaskSchedulerSimEvent) => {
      setSchedState((prev) => {
        const res = pureTaskSchedulerTransition(prev, event, rngRef.current);
        const v = checkers['task-scheduler'].check(res.nextState);
        if (v) haltRef.current(`[SCHED ${v.ruleId}] ${v.description}`);
        return res.nextState;
      });
    },
    [checkers],
  );
  const dispatchChat = useCallback(
    (event: ChatPresenceSimEvent) => {
      setChatState((prev) => {
        const res = pureChatPresenceTransition(prev, event, rngRef.current);
        const v = checkers['chat-presence'].check(res.nextState);
        if (v) haltRef.current(`[CHAT ${v.ruleId}] ${v.description}`);
        return res.nextState;
      });
    },
    [checkers],
  );
  const dispatchFs = useCallback(
    (event: FeatureStoreSimEvent) => {
      setFsState((prev) => {
        const res = pureFeatureStoreTransition(prev, event, rngRef.current);
        const v = checkers['feature-store'].check(res.nextState);
        if (v) haltRef.current(`[FS ${v.ruleId}] ${v.description}`);
        return res.nextState;
      });
    },
    [checkers],
  );
  const dispatchRoll = useCallback(
    (event: ModelRolloutSimEvent) => {
      setRollState((prev) => {
        const res = pureModelRolloutTransition(prev, event, rngRef.current);
        const v = checkers['model-rollout'].check(res.nextState);
        if (v) haltRef.current(`[ROLL ${v.ruleId}] ${v.description}`);
        return res.nextState;
      });
    },
    [checkers],
  );
  const dispatchEval = useCallback(
    (event: LlmEvalSimEvent) => {
      setEvalState((prev) => {
        const res = pureLlmEvalTransition(prev, event, rngRef.current);
        const v = checkers['llm-eval'].check(res.nextState);
        if (v) haltRef.current(`[EVAL ${v.ruleId}] ${v.description}`);
        return res.nextState;
      });
    },
    [checkers],
  );
  const dispatchChash = useCallback(
    (event: ConsistentHashingSimEvent) => {
      setChashState((prev) => {
        const res = pureConsistentHashingTransition(prev, event, rngRef.current);
        const v = checkers['consistent-hashing'].check(res.nextState);
        if (v) haltRef.current(`[CHASH ${v.ruleId}] ${v.description}`);
        return res.nextState;
      });
    },
    [checkers],
  );
  const dispatchProb = useCallback(
    (event: ProbabilisticStructuresSimEvent) => {
      setProbState((prev) => {
        const res = pureProbabilisticStructuresTransition(prev, event, rngRef.current);
        const v = checkers['probabilistic-structures'].check(res.nextState);
        if (v) haltRef.current(`[PROB ${v.ruleId}] ${v.description}`);
        return res.nextState;
      });
    },
    [checkers],
  );
  const dispatchMerkle = useCallback(
    (event: MerkleTreesSimEvent) => {
      setMerkleState((prev) => {
        const res = pureMerkleTreesTransition(prev, event, rngRef.current);
        const v = checkers['merkle-trees'].check(res.nextState);
        if (v) haltRef.current(`[MERKLE ${v.ruleId}] ${v.description}`);
        return res.nextState;
      });
    },
    [checkers],
  );

  switch (domainId) {
    case 'load-balancer':
      return <LoadBalancerVisualizer state={lbState} dispatch={dispatchLB} />;
    case 'search-index':
      return <SearchIndexVisualizer state={searchState} dispatch={dispatchSearch} />;
    case 'task-scheduler':
      return <TaskSchedulerVisualizer state={schedState} dispatch={dispatchSched} />;
    case 'chat-presence':
      return <ChatPresenceVisualizer state={chatState} dispatch={dispatchChat} />;
    case 'feature-store':
      return <FeatureStoreVisualizer state={fsState} dispatch={dispatchFs} />;
    case 'model-rollout':
      return <ModelRolloutVisualizer state={rollState} dispatch={dispatchRoll} />;
    case 'llm-eval':
      return <LlmEvalVisualizer state={evalState} dispatch={dispatchEval} />;
    case 'consistent-hashing':
      return <ConsistentHashingVisualizer state={chashState} dispatch={dispatchChash} />;
    case 'probabilistic-structures':
      return <ProbabilisticStructuresVisualizer state={probState} dispatch={dispatchProb} />;
    case 'merkle-trees':
      return <MerkleTreesVisualizer state={merkleState} dispatch={dispatchMerkle} />;
  }
}
