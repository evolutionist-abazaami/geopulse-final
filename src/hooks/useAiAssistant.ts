import { useRef, useState } from "react";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const generateLocalAssistantResponse = (query: string): string => {
  const q = query.toLowerCase();
  if (q.includes("deforest") || q.includes("tree") || q.includes("forest")) {
    return "To analyze deforestation on GeoPulse, navigate to **GeoWitness**, select **Deforestation** under Event Types, select your region on the interactive map, and set the temporal window. GeoPulse processes multi-spectral Sentinel-2 bands (NIR & Red) to calculate NDVI variance and detect vegetation canopy degradation.";
  }
  if (q.includes("flood") || q.includes("water") || q.includes("rain")) {
    return "GeoPulse detects surface water flooding using the Normalized Difference Water Index (NDWI) derived from Sentinel-2 imagery. In **GeoWitness**, select **Flood** to map surface water expansion and inundated agricultural or urban land.";
  }
  if (q.includes("ndvi")) {
    return "NDVI (Normalized Difference Vegetation Index) quantifies vegetation health: `NDVI = (NIR - Red) / (NIR + Red)`. High values (0.5 to 0.8) indicate dense, healthy canopy cover, while low values represent bare soil, urban structures, or water bodies.";
  }
  if (q.includes("drought") || q.includes("arid") || q.includes("dry")) {
    return "Drought tracking on GeoPulse integrates multi-spectral vegetation condition index (VCI) and soil moisture anomalies over time to provide early warnings for agricultural risk.";
  }
  return `GeoPulse provides AI-driven environmental intelligence across satellite datasets. You can execute natural language environmental searches in **GeoSearch**, perform Sentinel-2 satellite change analysis in **GeoWitness**, or upload geospatial files for custom evaluation. How can I assist you with your research?`;
};

export const quickQuestions = [
  "How do I analyze deforestation?",
  "What regions have high flood risk?",
  "Explain NDVI analysis",
];

/**
 * Extracted from the old floating AIAssistant.tsx widget - same SSE fetch
 * against the (Groq-backed) ai-assistant edge function, same manual
 * data:/[DONE] parsing, same offline local-response fallback. Only the
 * open/minimize/bubble chrome was dropped; the message/streaming logic is
 * untouched.
 */
export function useAiAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hello! I'm your GeoPulse AI Assistant. I can help you with environmental analysis, satellite imagery interpretation, and navigating the platform. How can I assist you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sendMessage = async (overrideInput?: string) => {
    const text = (overrideInput ?? input).trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    let assistantContent = "";

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim()}`,
          },
          body: JSON.stringify({
            messages: [...messagesRef.current, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`AI assistant stream returned status ${response.status}`);
      }
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (error) {
      console.warn("AI Assistant streaming endpoint unreachable. Generating local intelligent response:", error);
      const fallbackReply = generateLocalAssistantResponse(userMessage.content);
      setMessages((prev) => [...prev, { role: "assistant", content: fallbackReply }]);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, input, setInput, isLoading, sendMessage };
}
