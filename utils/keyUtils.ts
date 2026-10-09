/**
 * Utility functions for sanitizing, parsing, and validating Google Gemini API keys.
 */

export interface ParsedKeyResult {
  key: string | null;
  isValidFormat: boolean;
  isStandardGeminiFormat: boolean;
  error?: string;
}

export const parseAndValidateGeminiKey = (raw: string): ParsedKeyResult => {
  if (!raw) {
    return { key: null, isValidFormat: false, isStandardGeminiFormat: false, error: "Clipboard text is empty." };
  }

  let key = raw.trim();

  // 1. If user copied a full URL, query string, or header like:
  // ?gemini_api_key=AIzaSy... or gemini_api_key=AIzaSy... or x-gemini-api-key: AIzaSy...
  const queryMatch = key.match(/(?:gemini_api_key|x-gemini-api-key)[=:]\s*([a-zA-Z0-9_\-]+)/i);
  if (queryMatch) {
    key = queryMatch[1];
  }

  // 2. Strip surrounding quotes or punctuation
  key = key.replace(/^["'`]|["'`]$/g, '').trim();

  // 3. Minimum length check
  if (key.length < 20) {
    return { 
      key: null, 
      isValidFormat: false, 
      isStandardGeminiFormat: false, 
      error: "Text is too short to be a valid Gemini API key." 
    };
  }

  // Standard Google Gemini API keys start with "AIzaSy" and are 39 characters
  const isStandardGeminiFormat = key.startsWith("AIzaSy") && key.length === 39;

  return {
    key,
    isValidFormat: true,
    isStandardGeminiFormat
  };
};

/** Never persist or display a provider error containing a visitor credential. */
export const redactApiError = (message: unknown, apiKey?: string | null): string => {
  let safe = String(message);
  if (apiKey) {
    safe = safe.split(apiKey).join('[REDACTED]');
    safe = safe.split(encodeURIComponent(apiKey)).join('[REDACTED]');
  }
  return safe.replace(/AIza[0-9A-Za-z_-]{35}/g, '[REDACTED]');
};
