export interface PrioritizedRight {
  priority: number;
}

/** Higher numeric rights priority wins everywhere a rights policy is selected. */
export function compareRightsPriorityDescending(
  left: PrioritizedRight,
  right: PrioritizedRight,
): number {
  return right.priority - left.priority;
}

export function selectHighestPriorityRights<T extends PrioritizedRight>(
  candidates: readonly T[],
): T[] {
  if (candidates.length === 0) return [];
  const highestPriority = candidates.reduce(
    (highest, candidate) => Math.max(highest, candidate.priority),
    Number.NEGATIVE_INFINITY,
  );
  return candidates.filter((candidate) => candidate.priority === highestPriority);
}
