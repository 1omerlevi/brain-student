export const DEFAULT_LIMITS = {
  shortTerm: 12,
  longTerm: 8,
  topK: 5,
};

export function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getOptionalEnv(name, fallback) {
  return process.env[name] || fallback;
}
