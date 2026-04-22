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

function getActiveStates() {
  return getOptionalEnv("RETRIEVAL_ACTIVE_STATES", "active,current,emerging")
    .split(",")
    .map((state) => state.trim())
    .filter(Boolean);
}

async function runCandidateQuery(tableName, limit, selectClause, activeStates) {
  const supabase = getSupabaseClient();

  return supabase
    .from(tableName)
    .select(selectClause)
    .eq("is_active", true)
    .in("memory_state", activeStates)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
}

async function fetchCandidatesFromTable(tableName, limit) {
  const activeStates = getActiveStates();
  const selectVariants = [SELECT_WITH_EMBEDDING, SELECT_WITHOUT_EMBEDDING];
  const queryStrategies = [
    (selectClause) => runCandidateQuery(tableName, limit, selectClause, activeStates),
    (selectClause) =>
      getSupabaseClient()
        .from(tableName)
        .select(selectClause)
        .eq("is_active", true)
        .order("last_seen_at", { ascending: false })
        .limit(limit),
    (selectClause) =>
      getSupabaseClient()
        .from(tableName)
        .select(selectClause)
        .in("memory_state", activeStates)
        .order("last_seen_at", { ascending: false })
        .limit(limit),
  ];

  let data = null;
  let error = null;

  for (const selectClause of selectVariants) {
    for (const queryStrategy of queryStrategies) {
      ({ data, error } = await queryStrategy(selectClause));

      if (!error) {
        return (data || []).map((row) => ({
          ...row,
          source_table: tableName,
        }));
      }
    }
  }

  if (error) {
    throw new Error(`Failed to fetch candidates from ${tableName}: ${error.message}`);
  }

  return [];
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

function selectBalancedMemories(shortTermScored, longTermScored, topK, limits) {
  const totalCandidates = shortTermScored.length + longTermScored.length;
  if (topK <= 0 || totalCandidates === 0) {
    return [];
  }

  const availableShort = shortTermScored.length;
  const availableLong = longTermScored.length;
  const desiredShortWeight =
    limits.shortTerm / Math.max(1, limits.shortTerm + limits.longTerm);
  const shortTarget = Math.min(
    availableShort,
    Math.ceil(desiredShortWeight * topK)
  );
  const longTarget = Math.min(availableLong, Math.max(0, topK - shortTarget));

  const selected = [
    ...shortTermScored.slice(0, shortTarget),
    ...longTermScored.slice(0, longTarget),
  ];

  if (selected.length < topK) {
    const remaining = [
      ...shortTermScored.slice(shortTarget),
      ...longTermScored.slice(longTarget),
    ].sort((left, right) => right.retrievalScore - left.retrievalScore);

    selected.push(...remaining.slice(0, topK - selected.length));
  }

  return selected
    .sort((left, right) => right.retrievalScore - left.retrievalScore)
    .slice(0, topK);
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

  const scoredShortTerm = scoredCandidates.filter(
    (candidate) => candidate.source_table === shortTermTable
  );
  const scoredLongTerm = scoredCandidates.filter(
    (candidate) => candidate.source_table === longTermTable
  );
  const selectedCandidates = selectBalancedMemories(
    scoredShortTerm,
    scoredLongTerm,
    limits.topK,
    limits
  );

  return {
    input_context: inputContext,
    selected_memories: selectedCandidates.map((candidate, index) =>
      formatMemoryPacket(candidate, index + 1)
    ),
    retrieval_metadata: {
      candidate_count: candidates.length,
      short_term_count: shortTermCandidates.length,
      long_term_count: longTermCandidates.length,
      selected_short_term_count: selectedCandidates.filter(
        (candidate) => candidate.source_table === shortTermTable
      ).length,
      selected_long_term_count: selectedCandidates.filter(
        (candidate) => candidate.source_table === longTermTable
      ).length,
      openai_matching: {
        embedding_model: getOptionalEnv(
          "OPENAI_EMBEDDING_MODEL",
          "text-embedding-3-small"
        ),
        query_text: queryText,
      },
      active_state_filter: getActiveStates(),
    },
  };
}
