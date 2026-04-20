import OpenAI from "openai";
import { getOptionalEnv, getRequiredEnv } from "./config.js";

let openaiClient;

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: getRequiredEnv("OPENAI_API_KEY") });
  }

  return openaiClient;
}

export function buildQueryText(inputContext) {
  return [
    `image interpretation: ${inputContext.imageInterpretation || ""}`,
    `emotional tone: ${inputContext.emotionalTone || ""}`,
    `caption goal: ${inputContext.captionGoal || ""}`,
    `scene details: ${(inputContext.sceneDetails || []).join(", ")}`,
    `keywords: ${(inputContext.keywords || []).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCandidateText(candidate) {
  return [
    candidate.title,
    candidate.summary,
    Array.isArray(candidate.safe_anchors)
      ? candidate.safe_anchors.join(", ")
      : candidate.safe_anchors || "",
    typeof candidate.emotion_metadata === "string"
      ? candidate.emotion_metadata
      : JSON.stringify(candidate.emotion_metadata || {}),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function createEmbeddings(inputs) {
  const client = getOpenAIClient();
  const model = getOptionalEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small");
  const response = await client.embeddings.create({
    model,
    input: inputs,
    encoding_format: "float",
  });

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] * a[index];
    bNorm += b[index] * b[index];
  }

  if (aNorm === 0 || bNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}
