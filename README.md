# Student Brain PoC

This PoC implements steps 4-5 for the prompt-time retrieval team:

- uses OpenAI embeddings to match a caption input against stored memories
- returns a structured memory packet for the caption pipeline

## Setup

1. Copy `.env.example` to `.env` and fill in the secrets.
2. Install dependencies with `npm install openai @supabase/supabase-js dotenv`.
3. Run `npm run retrieve:test`.

## Expected table shape

Both `short_term_memories` and `long_term_memories` should expose these columns:

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
- `is_active`
- `embedding` (optional; if absent or null, the PoC computes embeddings on the fly)

## Retrieval flow

1. Pull candidate memories from short-term and long-term tables.
2. Build a query string from the caption input context.
3. Use OpenAI embeddings to measure semantic similarity between the input and each memory.
4. Blend semantic match with recency and cultural score fields.
5. Return the top memories as a JSON packet.
