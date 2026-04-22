# Student Brain PoC

This repo now includes both:

- parts 1-3: Supabase candidate retrieval plus heuristic ranking in TypeScript
- steps 4-5: OpenAI embedding-based matching plus final memory packet output in JavaScript

## Setup

1. Copy `.env.example` to `.env` and fill in the secrets.
2. Install dependencies with `npm install`.
3. Run either:
   - `npm run retrieve:parts13` for the parts 1-3 baseline flow
   - `npm run retrieve:test` for the OpenAI-enhanced steps 4-5 flow

## Repo layout

- `src/retrieveMemories.ts`: parts 1-3 baseline retrieval and ranking flow
- `src/index.ts`: sample runner for the TypeScript baseline flow
- `retrieval/retrieveMemories.js`: steps 4-5 retrieval with OpenAI matching
- `scripts/runRetrieval.js`: sample runner for the OpenAI-enhanced flow

## Expected table shape

For the OpenAI-enhanced flow, both `short_term_memories` and `long_term_memories` should expose these columns:

- `topic_id`
- `title`
- `summary`
- `safe_anchors`
- `memory_state`
- `emotion_metadata`
- `velocity_score`
- `resonance_score`
- `cultural_stickiness_score`
- `last_seen_at`
- `is_active` or a `memory_state` value included in `RETRIEVAL_ACTIVE_STATES`
- `embedding` (optional; if absent or null, the PoC computes embeddings on the fly)

## Retrieval flow

1. Pull candidate memories from short-term and long-term tables.
2. Build a query string from the caption input context.
3. Use OpenAI embeddings to measure semantic similarity between the input and each memory.
4. Blend semantic match with recency and cultural score fields.
5. Enforce a short-term/long-term memory balance in the final selection.
6. Return the top memories as a JSON packet.
