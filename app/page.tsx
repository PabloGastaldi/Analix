"use client";

import { useRef } from "react";
import { useDataStore } from "@/lib/store";
import { Hero } from "@/components/landing/Hero";
import { DataPreview } from "@/components/data/DataPreview";
import { TableSwitcher } from "@/components/data/TableSwitcher";
import { JoinPanel } from "@/components/data/JoinPanel";
import { CommentInput } from "@/components/dashboard/CommentInput";
import { WidgetGrid } from "@/components/dashboard/WidgetGrid";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default function Home() {
  const tables = useDataStore((s) => s.tables);
  const planStatus = useDataStore((s) => s.planStatus);
  const planError = useDataStore((s) => s.planError);
  const widgetResults = useDataStore((s) => s.widgetResults);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Gate on data presence, not ingest status: once a table exists the dashboard
  // stays mounted, so adding another file (which flips status to "loading")
  // never flashes back to the Hero.
  if (tables.length === 0) return <Hero />;

  const hasWidgets = widgetResults.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
      <TableSwitcher />

      <JoinPanel />

      <section className="flex max-w-xl flex-col gap-2">
        <CommentInput />
        {planStatus === "error" && planError && (
          <p role="alert" className="text-sm font-medium text-negative">
            {planError}
          </p>
        )}
      </section>

      {hasWidgets && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-end">
            <ExportButton targetRef={dashboardRef} />
          </div>
          {/* Captured region for PNG/PDF export — charts + narrated summary. */}
          <div ref={dashboardRef} className="flex flex-col gap-10">
            <WidgetGrid widgetResults={widgetResults} />
            <SummaryCard />
          </div>
        </div>
      )}

      <ChatPanel />

      <DataPreview />
    </main>
  );
}
