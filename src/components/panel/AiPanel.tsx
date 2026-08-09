import { useEffect, useRef } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiAssistant, quickQuestions } from "@/hooks/useAiAssistant";

export function AiPanel() {
  const { messages, input, setInput, isLoading, sendMessage } = useAiAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    sendMessage();
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin p-3.5 space-y-3">
        <div className="flex flex-col gap-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[92%] rounded-xl px-3 py-2.5 text-[13px] leading-relaxed",
                msg.role === "assistant"
                  ? "bg-gray-100 dark:bg-surface-2 border border-gray-200 dark:border-border-subtle text-gray-700 dark:text-v2-secondary rounded-tl-sm self-start"
                  : "bg-blue-50 dark:bg-brand-dim border border-blue-200 dark:border-brand-border text-gray-900 dark:text-v2-primary rounded-tr-sm self-end ml-auto"
              )}
            >
              {msg.content || <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          ))}
        </div>

        {messages.length === 1 && (
          <div className="pt-1 space-y-2">
            <p className="text-[11px] text-gray-400 dark:text-v2-muted">Quick questions</p>
            <div className="flex flex-wrap gap-1.5">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 dark:bg-brand-dim text-blue-600 dark:text-brand hover:bg-blue-100 dark:hover:bg-brand/20 transition-colors duration-fast"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-border-subtle p-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Ask about this analysis..."
          disabled={isLoading}
          className="flex-1 bg-gray-50 dark:bg-surface-2 border border-gray-200 dark:border-border-default rounded-lg px-3 py-2 text-[13px] text-gray-900 dark:text-v2-primary placeholder:text-gray-400 dark:placeholder:text-v2-muted resize-none min-h-[36px] max-h-[100px] outline-none focus:border-blue-300 dark:focus:border-border-accent transition-colors duration-fast"
          rows={1}
        />
        <button
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
          className="w-8 h-8 bg-brand rounded-md flex items-center justify-center flex-shrink-0 hover:bg-blue-500 disabled:opacity-50 transition-all duration-fast self-end"
        >
          {isLoading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <ArrowUp className="w-4 h-4 text-white" />}
        </button>
      </div>
    </div>
  );
}
