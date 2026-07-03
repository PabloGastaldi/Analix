"use client";

import { useState } from "react";
import { useDataStore } from "@/lib/store";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { Button } from "@/components/ui/button";

/**
 * Chat text-to-SQL panel (§Fase 4). Each answer is an executed widget rendered
 * with `ChartCard` (the exact number/chart from DuckDB) plus the SQL used, shown
 * in mono as transparency — the model translated, the engine computed.
 */
export function ChatPanel() {
  const messages = useDataStore((s) => s.chatMessages);
  const status = useDataStore((s) => s.chatStatus);
  const sendChatMessage = useDataStore((s) => s.sendChatMessage);
  const [input, setInput] = useState("");
  const loading = status === "loading";

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    void sendChatMessage(question);
  };

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-brand" />
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Preguntá sobre tus datos
        </h2>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Por ejemplo: «¿cuál fue el mes de mayor venta?» o «unidades vendidas
            por producto».
          </p>
        )}

        {messages.map((message, index) => {
          if (message.role === "user") {
            return (
              <div key={index} className="flex justify-end">
                <p className="max-w-[85%] rounded-inner bg-accent px-3 py-2 text-sm text-accent-foreground">
                  {message.text}
                </p>
              </div>
            );
          }
          if (message.role === "assistant-error") {
            return (
              <p key={index} className="text-sm text-negative">
                {message.text}
              </p>
            );
          }
          return (
            <div key={index} className="flex flex-col gap-2">
              <ChartCard result={message.result} />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Ver SQL
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-inner border border-border bg-muted p-3 font-mono text-xs text-foreground">
                  {message.sql}
                </pre>
              </details>
            </div>
          );
        })}

        {loading && <p className="text-sm text-muted-foreground">Pensando…</p>}
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Preguntá algo sobre tus datos…"
          disabled={loading}
          aria-label="Pregunta sobre tus datos"
          className="flex-1 rounded-inner border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <Button type="submit" disabled={loading || input.trim().length === 0}>
          Preguntar
        </Button>
      </form>
    </section>
  );
}
