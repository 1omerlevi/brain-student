import { DEFAULT_LIMITS, getOptionalEnv } from "../lib/config.js";
import {
  buildCandidateText,
  buildQueryText,
  createEmbeddings,
} from "../lib/openaiMatcher.js";
import { scoreCandidate } from "../lib/scoring.js";
import { getSupabaseClient } from "../lib/supabase.js";

const BASE_FIELDS = [
  "topic_id",
  "title",
  "summary",
  "safe_anchors",
  "memory_state",
  "emotion_metadata",
  "velocity_score",
  "resonance_score",
  "cultural_stickiness_score",
  "last_seen_at",
];

const SELECT_WITH_EMBEDDING = [...BASE_FIELDS, "embedding"].join(", ");
const SELECT_WITHOUT_EMBEDDING = BASE_FIELDS.join(", ");

async function fetchCandidatesFromTable(tableName, limit) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from(tableName)
    .select(SELECT_WITH_EMBEDDING)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  let { data, error } = await query;

  if (error && error.message.includes("embedding")) {
    query = supabase
      .from(tableName)
      .select(SELECT_WITHOUT_EMBEDDING)
      .order("last_seen_at", { ascending: false })
      .limit(limit);

    ({ data, error } = await query);
  }

  if (error) {
    throw new Error(`Failed to fetch candidates from ${tableName}: ${error.message}`);
  }

  return (data || []).map((row) => ({
    ...row,
    source_table: tableName,
  }));
}

function hasStoredEmbedding(candidate) {
  return Array.isArray(candidate.embedding) && candidate.embedding.length > 0;
}

function formatMemoryPacket(scoredMemory, rank) {
  return {
    rank,
    topic_id: scoredMemory.topic_id,
    title: scoredMemory.title,
    summary: scoredMemory.summary,
    safe_anchors: scoredMemory.safe_anchors || [],
    memory_state: scoredMemory.memory_state,
    retrieval_score: scoredMemory.retrievalScore,
    score_breakdown: scoredMemory.scoreBreakdown,
    source_table: scoredMemory.source_table,
  };
}

export async function retrieveMemories(inputContext, options = {}) {
  const shortTermTable = getOptionalEnv(
    "RETRIEVAL_SHORT_TERM_TABLE",
    "short_term_memories"
  );
  const longTermTable = getOptionalEnv(
    "RETRIEVAL_LONG_TERM_TABLE",
    "long_term_memories"
  );
  const limits = {
    shortTerm: options.shortTermLimit || DEFAULT_LIMITS.shortTerm,
    longTerm: options.longTermLimit || DEFAULT_LIMITS.longTerm,
    topK: options.topK || DEFAULT_LIMITS.topK,
  };

  const [shortTermCandidates, longTermCandidates] = await Promise.all([
    fetchCandidatesFromTable(shortTermTable, limits.shortTerm),
    fetchCandidatesFromTable(longTermTable, limits.longTerm),
  ]);

  const candidates = [...shortTermCandidates, ...longTermCandidates];

  if (candidates.length === 0) {
    return {
      input_context: inputContext,
      selected_memories: [],
      retrieval_metadata: {
        candidate_count: 0,
        short_term_count: 0,
        long_term_count: 0,
      },
    };
  }

  const queryText = buildQueryText(inputContext);
  const candidatesNeedingEmbeddings = candidates.filter(
    (candidate) => !hasStoredEmbedding(candidate)
  );

  const embeddingInputs = [
    queryText,
    ...candidatesNeedingEmbeddings.map((candidate) => buildCandidateText(candidate)),
  ];
  const embeddingVectors = await createEmbeddings(embeddingInputs);
  const queryEmbedding = embeddingVectors[0];

  for (let index = 0; index < candidatesNeedingEmbeddings.length; index += 1) {
    candidatesNeedingEmbeddings[index].embedding = embeddingVectors[index + 1];
  }

  const scoredCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      ...scoreCandidate(candidate, queryEmbedding),
    }))
    .sort((left, right) => right.retrievalScore - left.retrievalScore);

  return {
    input_context: inputContext,
    selected_memories: scoredCandidates
      .slice(0, limits.topK)
      .map((candidate, index) => formatMemoryPacket(candidate, index + 1)),
    retrieval_metadata: {
      candidate_count: candidates.length,
      short_term_count: shortTermCandidates.length,
      long_term_count: longTermCandidates.length,
      openai_matching: {
        embedding_model: getOptionalEnv(
          "OPENAI_EMBEDDING_MODEL",
          "text-embedding-3-small"
        ),
        query_text: queryText,
      },
    },
  };
}
