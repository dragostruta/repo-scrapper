import { createHash } from 'node:crypto';

export interface FlagRule {
  name: string;
  /** 0-100. The share of users the flag is on for. */
  rolloutPercentage: number;
}

/**
 * Decides whether a feature flag is on for one user. The user id is hashed
 * with the flag name so the same user always lands in the same bucket for a
 * given flag, and a rollout can be raised gradually without reshuffling who
 * already had it.
 */
export function isFlagEnabled(rule: FlagRule, userId: string): boolean {
  const digest = createHash('sha256').update(`${rule.name}:${userId}`).digest();
  const bucket = digest.readUInt32BE(0) % 100;
  return bucket < rule.rolloutPercentage;
}
