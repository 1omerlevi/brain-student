import { cosineSimilarity } from "./openaiMatcher.js";

const DEFAULT_WEIGHTS = {
  semanticMatch: 0.5,
  recency: 0.15,
  resonance: 0.15,
  velocity: 0.1,
  stickiness: 0.1,
};

function clampScore(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(value, 1));
}

export function normalizeRecency(lastSeenAt) {
  if (!lastSeenAt) {
    return 0;
  }

  const now = Date.now();
  const seenAt = new Date(lastSeenAt).getTime();
  const ageInDays = Math.max(0, (now - seenAt) / (1000 * 60 * 60 * 24));

  if (ageInDays <= 2) {
    return 1;
  }

  if (ageInDays >= 30) {
    return 0.1;
  }

  return clampScore(1 - (ageInDays - 2) / 28);
}

export function scoreCandidate(candidate, queryEmbedding) {
  const semanticMatch = cosineSimilarity(queryEmbedding, candidate.embedding);
  const recency = normalizeRecency(candidate.last_seen_at);
  const resonance = clampScore(candidate.resonance_score);
  const velocity = clampScore(candidate.velocity_score);
  const stickiness = clampScore(candidate.cultural_stickiness_score);

  const retrievalScore =
    semanticMatch * DEFAULT_WEIGHTS.semanticMatch +
    recency * DEFAULT_WEIGHTS.recency +
    resonance * DEFAULT_WEIGHTS.resonance +
    velocity * DEFAULT_WEIGHTS.velocity +
    stickiness * DEFAULT_WEIGHTS.stickiness;

  return {
    retrievalScore: Number(retrievalScore.toFixed(4)),
    scoreBreakdown: {
      semanticMatch: Number(semanticMatch.toFixed(4)),
      recency: Number(recency.toFixed(4)),
      resonance: Number(resonance.toFixed(4)),
      velocity: Number(velocity.toFixed(4)),
      culturalStickiness: Number(stickiness.toFixed(4)),
    },
  };
}
