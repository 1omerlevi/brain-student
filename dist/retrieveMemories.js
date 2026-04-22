import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config();
const SUPABASE_URL = process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_KEY ?? "");
const toneToCategory = {
    frustrated: "frustration",
    excited: "event",
    humorous: "humor_trend",
    sad: "social_dynamics",
    angry: "admin_action",
    happy: "tradition",
    embarrassed: "social_dynamics",
    neutral: "campus_culture",
};
export const DEFAULT_MEMORY_BALANCE = { shortTerm: 0.6, longTerm: 0.4 };
async function fetchCandidatesByMemoryType(memoryTypeId, limit = 200) {
    const { data: mappings, error: mapErr } = await supabase
        .from("topic_memory_mappings")
        .select("topic_id")
        .eq("memory_type_id", memoryTypeId)
        .limit(1000);
    if (mapErr) {
        throw new Error(`Failed to fetch mappings: ${mapErr.message}`);
    }
    const ids = (mappings ?? []).map((mapping) => mapping.topic_id).filter(Boolean);
    if (!ids.length) {
        return [];
    }
    const { data: topics, error: topicsErr } = await supabase
        .from("topics")
        .select("id, name, summary, category, description, safe_anchors, sensitivity_flags, example_posts, embedding")
        .in("id", ids)
        .limit(limit);
    if (topicsErr) {
        throw new Error(`Failed to fetch topics: ${topicsErr.message}`);
    }
    const topicIds = (topics ?? []).map((topic) => topic.id);
    const { data: metrics, error: metricsErr } = await supabase
        .from("topic_metrics")
        .select("topic_id, importance_score, recency_score, engagement_score, emotion_metadata")
        .in("topic_id", topicIds);
    if (metricsErr) {
        throw new Error(`Failed to fetch topic metrics: ${metricsErr.message}`);
    }
    const metricsById = {};
    (metrics ?? []).forEach((metric) => {
        metricsById[metric.topic_id] = metric;
    });
    return (topics ?? []).map((topic) => {
        const metric = metricsById[topic.id] ?? {};
        return {
            id: topic.id,
            name: topic.name,
            summary: topic.summary ?? "",
            category: topic.category ?? "",
            description: topic.description ?? "",
            safe_anchors: topic.safe_anchors ?? [],
            sensitivity_flags: topic.sensitivity_flags ?? [],
            example_posts: topic.example_posts ?? [],
            embedding: topic.embedding ?? null,
            memory_type_id: memoryTypeId,
            importance_score: Number(metric.importance_score ?? 0),
            recency_score: Number(metric.recency_score ?? 0),
            engagement_score: Number(metric.engagement_score ?? 0),
            emotion_metadata: metric.emotion_metadata ?? null,
            score: 0,
        };
    });
}
export async function fetchShortTermCandidates(limit = 200) {
    return fetchCandidatesByMemoryType(1, limit);
}
export async function fetchLongTermCandidates(limit = 200) {
    return fetchCandidatesByMemoryType(2, limit);
}
export function computeMemoryScore(memory, ctx = {}) {
    const now = ctx.now ?? new Date();
    const tauRecency = ctx.tau_recency_days ?? 3;
    const tauViral = ctx.tau_viral_days ?? 4;
    const daysSince = (timestamp) => {
        if (!timestamp) {
            return undefined;
        }
        const then = new Date(timestamp);
        const diff = Math.max(0, now.getTime() - then.getTime());
        return diff / (1000 * 60 * 60 * 24);
    };
    const tDays = daysSince(memory.timestamp);
    let recency = 0;
    if (typeof memory.recency_score === "number" && memory.timestamp === undefined) {
        recency = Math.max(0, Math.min(1, memory.recency_score));
    }
    else if (typeof tDays === "number") {
        recency = Math.exp(-tDays / tauRecency);
    }
    let engagementVal = 0;
    if (memory.social_engagement) {
        const reposts = Number(memory.social_engagement.reposts ?? 0);
        const likes = Number(memory.social_engagement.likes ?? 0);
        const comments = Number(memory.social_engagement.comments ?? 0);
        engagementVal = 0.5 * reposts + 0.3 * likes + 0.2 * comments;
    }
    else if (typeof memory.engagement_score === "number") {
        engagementVal = memory.engagement_score;
    }
    const viralMomentum = engagementVal *
        Math.exp(-((typeof tDays === "number" ? tDays : 0) / tauViral));
    let seasonal = 0;
    const seasonWidth = ctx.season_width_days ?? 10;
    if (typeof memory.seasonal_peak_day === "number") {
        const start = new Date(now.getFullYear(), 0, 0);
        const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const peak = memory.seasonal_peak_day;
        const raw = Math.abs(diff - peak);
        const daysFrom = Math.min(raw, 365 - raw);
        seasonal = Math.exp(-Math.pow(daysFrom / seasonWidth, 2));
    }
    else if (memory.recurrence_pattern === "annual") {
        seasonal = 0.6;
    }
    let emotionalMatch = 0;
    if (typeof ctx.current_emotion === "number" &&
        typeof memory.emotional_intensity === "number") {
        emotionalMatch = 1 - Math.abs(ctx.current_emotion - memory.emotional_intensity);
        emotionalMatch = Math.max(0, emotionalMatch);
    }
    else if (typeof ctx.current_emotion === "string" &&
        typeof memory.emotional_intensity === "string") {
        emotionalMatch = ctx.current_emotion === memory.emotional_intensity ? 1 : 0;
    }
    let humor = 0;
    if (memory.humor_potential && typeof memory.humor_potential === "object") {
        humor =
            0.4 * (memory.humor_potential.absurdity ?? 0) +
                0.3 * (memory.humor_potential.relatability ?? 0) +
                0.2 * (memory.humor_potential.irony ?? 0) +
                0.1 * (memory.humor_potential.exaggeration ?? 0);
    }
    else if (typeof memory.humor_potential === "number") {
        humor = memory.humor_potential;
    }
    const importance = Math.max(0, Math.min(1, Number(memory.importance ?? 0)));
    let contextSimilarity = 0;
    if (Array.isArray(ctx.current_context_embedding) && Array.isArray(memory.embedding)) {
        const a = ctx.current_context_embedding;
        const b = memory.embedding;
        const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
        const aNorm = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
        const bNorm = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
        if (aNorm > 0 && bNorm > 0) {
            contextSimilarity = dot / (aNorm * bNorm);
        }
    }
    const trendBoost = Math.log(Number(memory.mentions ?? 0) + 1);
    const novelty = 1 / (1 + Number(memory.recent_usage_count ?? 0));
    const weights = {
        recency: 0.2,
        viral: 0.2,
        seasonal: 0.15,
        emotion: 0.15,
        humor: 0.15,
        importance: 0.1,
        context: 0.05,
    };
    const category = (memory.category || "").toString().toLowerCase();
    if (category.includes("season") || category === "seasonal") {
        weights.recency = 0.05;
        weights.seasonal = 0.35;
    }
    else if (category.includes("evergreen") || category === "evergreen") {
        weights.recency = 0.05;
        weights.humor = 0.3;
        weights.context = 0.3;
        weights.importance = 0.2;
    }
    const weightedSum = weights.recency * recency +
        weights.viral * viralMomentum +
        weights.seasonal * seasonal +
        weights.emotion * emotionalMatch +
        weights.humor * humor +
        weights.importance * importance +
        weights.context * contextSimilarity;
    let finalBase = weightedSum;
    if (category.includes("viral") || category === "viral_event") {
        const viralCurve = Math.exp(-((typeof tDays === "number" ? tDays : 0) / 4));
        finalBase *= viralCurve;
    }
    const finalWithTrend = finalBase + 0.05 * trendBoost;
    const finalScore = novelty * finalWithTrend;
    return {
        score: Number(finalScore),
        breakdown: {
            recency,
            viralMomentum,
            seasonal,
            emotionalMatch,
            humor,
            importance,
            contextSimilarity,
            weights,
            trendBoost,
            novelty,
            finalBase,
            finalWithTrend,
        },
    };
}
export async function retrieveMemories(scene, balance = DEFAULT_MEMORY_BALANCE) {
    const topK = scene.topK ?? 5;
    const emotion = (scene.reaction_snapshot?.internal_emotion ?? "")
        .toLowerCase()
        .trim();
    const elements = (scene.scene_understanding?.observable_elements ?? []).map((item) => item.toLowerCase());
    let category = toneToCategory[emotion] ?? "campus_culture";
    if (elements.includes("smiles") ||
        elements.includes("pointing gesture") ||
        elements.includes("pointing")) {
        if (emotion === "embarrassed" || category === "campus_culture") {
            category = "humor_trend";
        }
    }
    if (!scene.scenario_assessment?.scenario_present) {
        category = "campus_culture";
    }
    const shortAlloc = Math.max(1, Math.round(topK * balance.shortTerm));
    const longAlloc = Math.max(0, topK - shortAlloc);
    const [shortCandidates, longCandidates] = await Promise.all([
        fetchShortTermCandidates(Math.max(200, shortAlloc * 4)),
        fetchLongTermCandidates(Math.max(200, longAlloc * 4)),
    ]);
    function scoreCandidate(topic) {
        const memoryForScoring = {
            timestamp: topic.last_seen ?? topic.first_seen ?? undefined,
            category: topic.category ?? category,
            emotional_intensity: topic.emotion_metadata ?? undefined,
            social_engagement: topic.social_engagement ?? {
                reposts: 0,
                likes: Number(topic.engagement_score ?? 0),
                comments: 0,
            },
            humor_potential: topic.humor_potential ?? undefined,
            importance: Number(topic.importance_score ?? 0),
            recurrence_pattern: topic.recurrence_pattern ?? undefined,
            embedding: topic.embedding ?? undefined,
            mentions: topic.mentions ?? 0,
            recent_usage_count: topic.recent_usage_count ?? 0,
        };
        const scoringContext = {
            now: new Date(),
            current_emotion: emotion || undefined,
            current_context_embedding: undefined,
            season_width_days: 7,
        };
        const result = computeMemoryScore(memoryForScoring, scoringContext);
        topic.score = result.score;
        return topic;
    }
    const scoredShort = shortCandidates
        .map(scoreCandidate)
        .sort((left, right) => right.score - left.score);
    const scoredLong = longCandidates
        .map(scoreCandidate)
        .sort((left, right) => right.score - left.score);
    const selected = [
        ...scoredShort.slice(0, shortAlloc),
        ...scoredLong.slice(0, longAlloc),
    ];
    if (selected.length < topK) {
        const needed = topK - selected.length;
        const remaining = [
            ...scoredShort.slice(shortAlloc),
            ...scoredLong.slice(longAlloc),
        ].sort((left, right) => right.score - left.score);
        selected.push(...remaining.slice(0, needed));
    }
    return selected
        .sort((left, right) => right.score - left.score)
        .slice(0, topK)
        .map((topic) => ({
        id: topic.id,
        name: topic.name,
        summary: topic.summary ?? "",
        category: topic.category ?? "",
        description: topic.description ?? "",
        score: topic.score ?? 0,
    }));
}
export default retrieveMemories;
