export interface GroqRequestOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

export function groqChatCompletion(
  apiKey: string,
  requestBody: Record<string, unknown>,
  options: GroqRequestOptions = {},
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  return fetcher("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal: options.signal,
  });
}
