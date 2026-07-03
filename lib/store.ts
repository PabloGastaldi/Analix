"use client";

import { create } from "zustand";
import type {
  DashboardPlan,
  DashboardSummary,
  JoinPlan,
  JoinRelationship,
  SemanticType,
  Widget,
} from "@/lib/schemas";
import { getDuckDB } from "@/lib/duckdb/client";
import { correct, type CorrectionProfile } from "@/lib/duckdb/correctSql";
import { executePlan } from "@/lib/duckdb/executePlan";
import { loadCsvTable } from "@/lib/duckdb/loadTable";
import { runQuery, type Row } from "@/lib/duckdb/query";
import { uniqueTableName } from "@/lib/duckdb/tableName";
import { detectKeys } from "@/lib/joins/detectKeys";
import { buildJoinView } from "@/lib/joins/buildJoinView";
import type { CandidateKey } from "@/lib/joins/rankCandidates";
import { fileToCsv } from "@/lib/parse";
import { profileTable } from "@/lib/profile";
import {
  addTable,
  applyPlan,
  applyWidgetResult,
  removeTable as removeTableReducer,
  setActiveTable as setActiveTableReducer,
  updateActiveColumnType,
  type ChatMessage,
  type DataTable,
  type TableRegistryState,
} from "@/lib/store.reducers";

const PREVIEW_LIMIT = 50;

export type IngestStatus = "idle" | "loading" | "ready" | "error";
export type SummaryStatus = "idle" | "loading" | "ready" | "error";
export type JoinProposalStatus = "idle" | "detecting" | "proposing" | "ready" | "error";

export type { ChatMessage, DataTable };

/** Plain-language fan-out warning copy (design §6). */
function fanOutWarningFor(cardinality: JoinRelationship["cardinality"]): string | undefined {
  if (cardinality === "one-to-one") return undefined;
  return "Esta relación repite filas de un lado por cada coincidencia del otro — los totales y sumas pueden estar inflados por filas duplicadas. Leé los agregados con cuidado.";
}

interface DataState extends TableRegistryState {
  status: IngestStatus;
  error: string | null;
  ingestFile: (file: File) => Promise<void>;
  updateColumnType: (columnName: string, type: SemanticType) => void;
  setActiveTable: (tableName: string) => void;
  removeTable: (tableName: string) => Promise<void>;
  reset: () => void;
  /** Derived getter: the `DataTable` for `activeTableName`, or `null`. */
  activeTable: () => DataTable | null;

  // Join proposal slice (design §2-§4-§7, Slice 2). Detection runs after
  // ingest settles, never on the ingest critical path. Nothing is computed
  // until the user explicitly confirms (design "Pre-run join" resolution).
  candidateKeys: CandidateKey[];
  joinProposal: JoinPlan | null;
  joinProposalStatus: JoinProposalStatus;
  joinProposalError: string | null;
  detectAndProposeJoin: () => Promise<void>;
  confirmJoin: (relationship: JoinRelationship) => Promise<void>;
  rejectJoinProposal: () => void;

  // Plan slice (design §5, Work Unit 8) — comment -> plan -> execute -> render.
  setComment: (comment: string) => void;
  generatePlan: () => Promise<void>;

  // Narrative summary slice (§Fase 3) — insights over the plan + results.
  generateSummary: () => Promise<void>;

  // Chat slice (§Fase 4) — question -> SQL -> DuckDB -> answer widget.
  chatStatus: "idle" | "loading";
  sendChatMessage: (question: string) => Promise<void>;
}

/** `TableProfile` -> the minimal shape `correct()` needs (table + column names). */
function toCorrectionProfile(profile: {
  tableName: string;
  columns: { name: string }[];
}): CorrectionProfile {
  return {
    tableName: profile.tableName,
    columns: profile.columns.map((column) => column.name),
  };
}

/** Build the `date`-safe preview SELECT list + run it (shared by ingest + future re-preview). */
async function loadPreviewRows(
  db: Awaited<ReturnType<typeof getDuckDB>>,
  tableName: string,
  columns: { name: string; rawType: string }[],
): Promise<Row[]> {
  const selectList = columns
    .map((column) => {
      const name = `"${column.name.replace(/"/g, '""')}"`;
      return column.rawType === "date" ? `CAST(${name} AS VARCHAR) AS ${name}` : name;
    })
    .join(", ");
  return runQuery(db, `SELECT ${selectList} FROM "${tableName}" LIMIT ${PREVIEW_LIMIT}`);
}

export const useDataStore = create<DataState>((set, get) => ({
  tables: [],
  activeTableName: null,
  status: "idle",
  error: null,

  comment: "",
  plan: null,
  widgetResults: [],
  planStatus: "idle",
  planError: null,

  summary: null,
  summaryStatus: "idle",
  summaryError: null,

  candidateKeys: [],
  joinProposal: null,
  joinProposalStatus: "idle",
  joinProposalError: null,

  chatMessages: [],
  chatStatus: "idle",

  activeTable() {
    const { tables, activeTableName } = get();
    return tables.find((table) => table.tableName === activeTableName) ?? null;
  },

  async ingestFile(file) {
    set({ status: "loading", error: null });
    try {
      const { csv } = await fileToCsv(file);
      const db = await getDuckDB();
      const existingNames = get().tables.map((table) => table.tableName);
      const tableName = uniqueTableName(file.name, existingNames);
      await loadCsvTable(db, tableName, csv);
      const profile = await profileTable(db, tableName);
      // Date/timestamp columns come back from Arrow as epoch numbers; cast them
      // to text so the preview shows readable values instead of raw timestamps.
      const previewRows = await loadPreviewRows(db, tableName, profile.columns);
      const table: DataTable = {
        tableName,
        fileName: file.name,
        profile,
        previewRows,
        kind: "file",
      };
      set((state) => ({ ...addTable(state, table), status: "ready" }));
    } catch (err) {
      set({
        status: "error",
        error:
          err instanceof Error
            ? err.message
            : "No pudimos leer el archivo. Revisá el formato e intentá de nuevo.",
      });
    }
  },

  updateColumnType(columnName, type) {
    set((state) => updateActiveColumnType(state, columnName, type));
  },

  setActiveTable(tableName) {
    set((state) => setActiveTableReducer(state, tableName));
  },

  async removeTable(tableName) {
    try {
      const db = await getDuckDB();
      await runQuery(db, `DROP VIEW IF EXISTS "${tableName}"`);
      await runQuery(db, `DROP TABLE IF EXISTS "${tableName}"`);
    } catch {
      // Best-effort cleanup — still drop the entry from the registry below so
      // the UI never gets stuck on a DuckDB-side failure.
    }
    set((state) => removeTableReducer(state, tableName));
    // A removed base table invalidates any in-flight candidate/proposal —
    // re-detect against the remaining tables rather than show a stale one.
    set({ candidateKeys: [], joinProposal: null, joinProposalStatus: "idle", joinProposalError: null });
  },

  reset() {
    set({
      tables: [],
      activeTableName: null,
      status: "idle",
      error: null,
      comment: "",
      plan: null,
      widgetResults: [],
      planStatus: "idle",
      planError: null,
      summary: null,
      summaryStatus: "idle",
      summaryError: null,
      candidateKeys: [],
      joinProposal: null,
      joinProposalStatus: "idle",
      joinProposalError: null,
      chatMessages: [],
      chatStatus: "idle",
    });
  },

  setComment(comment) {
    set({ comment });
  },

  async detectAndProposeJoin() {
    const { tables } = get();
    // Only original files are join sources — a joined view shares every column
    // with its parents by construction, so feeding it back into detection would
    // produce circular candidates (view ↔ its own sources) and re-propose joins
    // that already exist.
    const sourceTables = tables.filter((table) => table.kind === "file");
    if (sourceTables.length < 2) {
      set({ candidateKeys: [], joinProposalStatus: "idle" });
      return;
    }

    set({ joinProposalStatus: "detecting", joinProposalError: null, joinProposal: null });

    let detected: CandidateKey[];
    try {
      const db = await getDuckDB();
      detected = await detectKeys(
        db,
        sourceTables.map((table) => table.profile),
      );
    } catch {
      // Detection failure degrades silently to the per-table experience —
      // it must never surface as a blocking error (design "Degradation").
      set({ candidateKeys: [], joinProposalStatus: "idle" });
      return;
    }

    // Drop candidates whose table pair is already materialized as a joined view
    // (tracked via `dependsOn`), so confirming a join dismisses the panel
    // instead of re-proposing the same relationship.
    const joinedPairs = new Set(
      tables
        .filter((table) => table.kind === "join" && table.dependsOn?.length === 2)
        .map((table) => [...table.dependsOn!].sort().join("|")),
    );
    const candidateKeys = detected.filter(
      (key) => !joinedPairs.has([key.leftTable, key.rightTable].sort().join("|")),
    );

    set({ candidateKeys });
    if (candidateKeys.length === 0) {
      set({ joinProposalStatus: "idle" });
      return;
    }

    set({ joinProposalStatus: "proposing" });
    try {
      const response = await fetch("/api/joins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: sourceTables.map((table) => table.profile),
          candidates: candidateKeys,
          comment: get().comment,
        }),
      });
      const body = (await response.json()) as
        | { ok: true; plan: JoinPlan }
        | { ok: false; error: { code: string; message: string } };

      if (!body.ok) {
        // Inference failure/degrade -> per-table experience continues, no panel.
        set({ joinProposal: null, joinProposalStatus: "idle", joinProposalError: null });
        return;
      }
      if (body.plan.relationships.length === 0) {
        set({ joinProposal: null, joinProposalStatus: "idle" });
        return;
      }
      set({ joinProposal: body.plan, joinProposalStatus: "ready" });
    } catch {
      // Network failure -> degrade to per-table experience, never a blocking error.
      set({ joinProposal: null, joinProposalStatus: "idle" });
    }
  },

  async confirmJoin(relationship) {
    const { tables } = get();
    const left = tables.find((table) => table.tableName === relationship.leftTable);
    const right = tables.find((table) => table.tableName === relationship.rightTable);
    if (!left || !right) return;

    try {
      const db = await getDuckDB();
      const joinTable = await buildJoinView(
        db,
        {
          leftTable: relationship.leftTable,
          leftColumn: relationship.leftColumn,
          rightTable: relationship.rightTable,
          rightColumn: relationship.rightColumn,
          joinType: relationship.joinType,
        },
        {
          leftColumns: left.profile.columns.map((column) => column.name),
          rightColumns: right.profile.columns.map((column) => column.name),
          existingTableNames: tables.map((table) => table.tableName),
        },
      );

      const fanOutWarning = fanOutWarningFor(relationship.cardinality);
      const tableWithWarning: DataTable = fanOutWarning
        ? { ...joinTable, fanOutWarning }
        : joinTable;

      set((state) => ({
        ...setActiveTableReducer(addTable(state, tableWithWarning), tableWithWarning.tableName),
        joinProposal: null,
        joinProposalStatus: "idle",
      }));
    } catch (err) {
      // View creation failure must never crash the dashboard (spec "View
      // creation fails") — surface it and leave both source tables usable.
      set({
        joinProposalStatus: "error",
        joinProposalError:
          err instanceof Error
            ? err.message
            : "No pudimos crear la vista combinada. Probá de nuevo.",
      });
    }
  },

  rejectJoinProposal() {
    set({ joinProposal: null, joinProposalStatus: "idle", joinProposalError: null });
  },

  async generatePlan() {
    const profile = get().activeTable()?.profile;
    const { comment } = get();
    if (!profile || comment.trim().length === 0) return;

    set({
      planStatus: "planning",
      planError: null,
      summary: null,
      summaryStatus: "idle",
      summaryError: null,
    });

    let response: Response;
    try {
      response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, comment }),
      });
    } catch (err) {
      set({
        planStatus: "error",
        planError:
          err instanceof Error
            ? err.message
            : "No pudimos conectar con el servidor. Intentá de nuevo.",
      });
      return;
    }

    const body = (await response.json()) as
      | { ok: true; plan: DashboardPlan }
      | { ok: false; error: { code: string; message: string } };

    if (!body.ok) {
      set({ planStatus: "error", planError: body.error.message });
      return;
    }

    set((state) => applyPlan(state, body.plan));

    const db = await getDuckDB();
    const correctionProfile = toCorrectionProfile(profile);
    const correctFn = (sql: string, errorMessage: string) =>
      correct(sql, errorMessage, correctionProfile);

    // Widgets settle independently (design §5 step 4) — apply each result as
    // it resolves so the grid fills incrementally, not atomically.
    await Promise.all(
      body.plan.widgets.map(async (widget) => {
        const [result] = await executePlan(db, { title: body.plan.title, widgets: [widget] }, correctFn);
        if (result) {
          set((state) => applyWidgetResult(state, result));
        }
      }),
    );

    // Widgets have settled — narrate them (§Fase 3). Fire-and-forget: the
    // dashboard is already usable; the summary fills in when ready.
    void get().generateSummary();
  },

  async generateSummary() {
    const profile = get().activeTable()?.profile;
    const { plan, widgetResults } = get();
    if (!profile || !plan) return;

    set({ summaryStatus: "loading", summaryError: null });

    try {
      const response = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, plan, results: widgetResults }),
      });
      const body = (await response.json()) as
        | { ok: true; summary: DashboardSummary }
        | { ok: false; error: { code: string; message: string } };

      if (!body.ok) {
        set({ summaryStatus: "error", summaryError: body.error.message });
        return;
      }
      set({ summary: body.summary, summaryStatus: "ready" });
    } catch (err) {
      set({
        summaryStatus: "error",
        summaryError:
          err instanceof Error ? err.message : "No pudimos generar el resumen.",
      });
    }
  },

  async sendChatMessage(question) {
    const trimmed = question.trim();
    const profile = get().activeTable()?.profile;
    if (!profile || trimmed.length === 0 || get().chatStatus === "loading") return;

    set((state) => ({
      chatMessages: [...state.chatMessages, { role: "user", text: trimmed }],
      chatStatus: "loading",
    }));

    const appendAssistant = (message: ChatMessage) =>
      set((state) => ({
        chatMessages: [...state.chatMessages, message],
        chatStatus: "idle",
      }));

    // 1. Question -> SQL widget (server, Sonnet 5). Only the schema is sent.
    let widget: Widget;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, question: trimmed }),
      });
      const body = (await response.json()) as
        | { ok: true; widget: Widget }
        | { ok: false; error: { code: string; message: string } };
      if (!body.ok) {
        appendAssistant({ role: "assistant-error", text: body.error.message });
        return;
      }
      widget = body.widget;
    } catch {
      appendAssistant({
        role: "assistant-error",
        text: "No pudimos conectar con el servidor. Intentá de nuevo.",
      });
      return;
    }

    // 2. Run the widget SQL in DuckDB (client-side, with the correction loop).
    try {
      const db = await getDuckDB();
      const correctionProfile = toCorrectionProfile(profile);
      const correctFn = (sql: string, errorMessage: string) =>
        correct(sql, errorMessage, correctionProfile);
      const [result] = await executePlan(
        db,
        { title: widget.title, widgets: [widget] },
        correctFn,
      );
      if (!result) {
        appendAssistant({
          role: "assistant-error",
          text: "No pudimos ejecutar la consulta.",
        });
        return;
      }
      const sql = result.status === "ok" ? result.sql : widget.sql;
      appendAssistant({ role: "assistant", result, sql });
    } catch {
      appendAssistant({
        role: "assistant-error",
        text: "No pudimos ejecutar la consulta sobre tus datos.",
      });
    }
  },
}));
