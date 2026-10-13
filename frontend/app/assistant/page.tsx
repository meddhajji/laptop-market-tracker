"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowDown, ArrowUp, CirclePlus, Loader2, StopCircle, X } from "lucide-react";
import { LaptopTable } from "@/components/laptops/LaptopTable";
import { ALL_COLUMNS } from "@/components/laptops/Columns";
import type { Laptop } from "@/lib/types";
import { cn } from "@/lib/utils";

type LaptopFilters = {
  search_terms?: string[];
  city?: string;
  price_min?: number;
  price_max?: number;
  ram_min?: number;
  storage_min?: number;
  gpu_type?: string;
  gpu?: string;
  gpu_vram_min?: number;
  screen_size_min?: number;
  screen_size_max?: number;
  refresh_rate_min?: number;
  is_new?: boolean;
  touchscreen?: boolean;
  suggested_columns?: string[];
  limit?: number;
  sort_by?: "score" | "price" | "value";
  sort_order?: "asc" | "desc";
};

type SearchStats = {
  total?: number;
  price_range?: string | null;
  top_city?: string | null;
  shown_in_table?: number;
};

/** Sent by the server with every search: the filters it applied and what it found. */
type SearchData = { filters: LaptopFilters; stats: SearchStats; language?: string };

type MessagePart = {
  type?: string;
  text?: string;
  id?: string;
  data?: unknown;
};

type ChatMessage = UIMessage & {
  parts?: MessagePart[];
};

const CORE_COLS = new Set(["score", "brand", "model", "price", "link"]);
const DEFAULT_VISIBLE = new Set(ALL_COLUMNS.filter((column) => column.defaultOn).map((column) => column.key));
const LANE_CLASS = "mx-auto w-full max-w-[900px] px-4 sm:px-6";
const CONTENT_LANE_CLASS = "mx-auto w-full max-w-[900px] pl-5 pr-3 sm:pl-7 sm:pr-5";

// The server gets the new question, the last few questions and the previous
// search's filters: not the transcript, which it would have no reason to trust.
const transport = new DefaultChatTransport({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const getSearchPart = (message: ChatMessage): MessagePart | null =>
  message.parts?.find((part) => part.type === "data-search") ?? null;

const getSearchData = (part: MessagePart | null): SearchData | null => {
  if (!part || !isRecord(part.data) || !isRecord(part.data.filters)) return null;
  return {
    filters: part.data.filters as LaptopFilters,
    stats: isRecord(part.data.stats) ? (part.data.stats as SearchStats) : {},
    language: typeof part.data.language === "string" ? part.data.language : undefined,
  };
};

/** Filters the server announced before running the query. */
const getPlannedFilters = (message: ChatMessage): LaptopFilters | null => {
  const part: MessagePart | undefined = message.parts?.find((candidate) => candidate.type === "data-plan");
  return part && isRecord(part.data) && isRecord(part.data.filters) ? (part.data.filters as LaptopFilters) : null;
};

const getLaptops = (message: ChatMessage): Laptop[] => {
  const part: MessagePart | undefined = message.parts?.find((candidate) => candidate.type === "data-laptops");
  return Array.isArray(part?.data) ? (part.data as Laptop[]) : [];
};

const getSmartColumns = (filters: LaptopFilters | null | undefined): Set<string> => {
  const visible = new Set(DEFAULT_VISIBLE);
  filters?.suggested_columns?.forEach((column) => {
    if (ALL_COLUMNS.some((definition) => definition.key === column)) {
      visible.add(column);
    }
  });
  return visible;
};

const getTextContent = (message: ChatMessage): string =>
  message.parts?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("") ?? "";

type FilterChip = { key: keyof LaptopFilters; label: string };

/** The active filters, one entry per filter the visitor can see and remove. */
const describeFilters = (filters: LaptopFilters | null): FilterChip[] => {
  if (!filters) return [];

  const chips: FilterChip[] = [];
  const add = (key: keyof LaptopFilters, label: string) => chips.push({ key, label });
  if (filters.search_terms?.length) add("search_terms", filters.search_terms.slice(0, 3).join(", "));
  if (filters.city) add("city", `in ${filters.city}`);
  if (filters.price_max) add("price_max", `under ${filters.price_max.toLocaleString("en-US")} DH`);
  if (filters.price_min) add("price_min", `from ${filters.price_min.toLocaleString("en-US")} DH`);
  if (filters.ram_min) add("ram_min", `${filters.ram_min}GB+ RAM`);
  if (filters.storage_min) add("storage_min", `${filters.storage_min}GB+ storage`);
  if (filters.gpu_type) add("gpu_type", `${filters.gpu_type} GPU`);
  if (filters.gpu) add("gpu", filters.gpu);
  if (filters.refresh_rate_min) add("refresh_rate_min", `${filters.refresh_rate_min}Hz+`);
  if (filters.is_new === true) add("is_new", "new only");
  if (filters.is_new === false) add("is_new", "used only");
  if (filters.touchscreen === true) add("touchscreen", "touchscreen");
  if (filters.sort_by === "price") add("sort_by", filters.sort_order === "desc" ? "highest price first" : "cheapest first");
  if (filters.sort_by === "value") add("sort_by", "best deals first");
  return chips;
};

const formatFilters = (filters: LaptopFilters | null, resultCount: number) => {
  if (!filters) return resultCount > 0 ? "Best matches" : "No active filters";
  const chips = describeFilters(filters);
  return chips.length > 0 ? chips.map((chip) => chip.label).join(" · ") : "Best matches";
};

function ChatInput({
  value,
  isLoading,
  onChange,
  onSubmit,
  onStop,
}: {
  value: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = value.trim().length > 0 && !isLoading;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [value]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (canSubmit) onSubmit();
  };

  return (
    <form onSubmit={submit} className="relative">
      <div className="liquid-glass flex items-end gap-2 rounded-2xl bg-white/[0.045] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.55)] transition-colors focus-within:border-white/20 focus-within:bg-white/[0.065]">
        <textarea
          ref={textareaRef}
          rows={1}
          maxLength={600}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          placeholder="Ask the assistant"
          className="min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-[15px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/45"
        />
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generation"
            className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-foreground transition hover:bg-white/15"
          >
            <StopCircle className="size-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSubmit}
            aria-label="Send message"
            className={cn(
              "mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl transition",
              canSubmit
                ? "bg-foreground text-background shadow-lg shadow-white/10 hover:scale-[1.03] active:scale-95"
                : "cursor-not-allowed border border-white/10 bg-white/5 text-muted-foreground/35"
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2.6} />
          </button>
        )}
      </div>
    </form>
  );
}

/** Three dots, the way a person typing looks in any chat. */
function TypingDots() {
  return (
    <div className={cn(CONTENT_LANE_CLASS, "flex items-center gap-1.5 py-3 animate-in fade-in duration-300")} role="status" aria-label="Working on it">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
        />
      ))}
    </div>
  );
}

/** Stands in for the results while the query runs, already saying what is being searched. */
function SearchingPanel({ filters }: { filters: LaptopFilters }) {
  return (
    <div className={cn(CONTENT_LANE_CLASS, "animate-in fade-in slide-in-from-bottom-2 duration-300")}>
      <div className="rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_20px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
            <Loader2 className="size-3 animate-spin" />
            Searching
          </div>
          <div className="mt-1 truncate text-[13px] text-muted-foreground">{formatFilters(filters, 0)}</div>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {[72, 58, 66, 50, 62].map((width, row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-3.5 animate-pulse" style={{ animationDelay: `${row * 120}ms` }}>
              <div className="h-4 w-9 rounded bg-white/[0.07]" />
              <div className="h-4 rounded bg-white/[0.07]" style={{ width: `${width}%` }} />
              <div className="ml-auto h-4 w-16 rounded bg-white/[0.07]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className={cn(CONTENT_LANE_CLASS, "py-2 animate-in fade-in duration-200")}>
      <div className="rounded-xl border border-red-400/15 bg-red-500/8 px-4 py-3 text-[13px] font-medium text-red-200">
        {message}
      </div>
    </div>
  );
}

type StreamPhase = "idle" | "reading" | "searching" | "preparing";

/** Pure function: derives the current loading phase from SDK status + last message parts. */
const getStreamPhase = (status: string, messages: ChatMessage[]): StreamPhase => {
  if (status !== "submitted" && status !== "streaming") return "idle";
  const lastMsg = messages[messages.length - 1];
  // Still waiting for the assistant's first chunk
  if (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.parts?.length) return "reading";
  // Text has started streaming: no indicator needed
  if (getTextContent(lastMsg).length > 0) return "idle";
  // Results are on screen, the written summary is on its way
  if (getSearchPart(lastMsg)) return "preparing";
  // The request is understood and the query is running: the message shows a placeholder panel
  return getPlannedFilters(lastMsg) ? "searching" : "reading";
};

function StreamingIndicator({ phase }: { phase: StreamPhase }) {
  return phase === "reading" || phase === "preparing" ? <TypingDots /> : null;
}

const NOOP = () => { };

const ResultPanel = React.memo(function ResultPanel({
  laptops,
  filters,
  stats,
  visibleCols,
  toggleCol,
  onRemoveFilter,
}: {
  laptops: Laptop[];
  filters: LaptopFilters | null;
  stats: SearchStats | null;
  visibleCols: Set<string>;
  toggleCol: (key: string) => void;
  /** Given for the latest result only: its filters can be removed one by one. */
  onRemoveFilter?: (chip: FilterChip) => void;
}) {
  const total = stats?.total ?? laptops.length;
  const shown = laptops.length;
  const chips = onRemoveFilter ? describeFilters(filters) : [];

  return (
    <div className={cn(CONTENT_LANE_CLASS, "animate-in fade-in slide-in-from-bottom-3 duration-500")}>
      <div className="rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_20px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="shrink-0 text-[12px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
              {shown}/{total} {total === 1 ? "match" : "matches"} shown
            </div>
            {onRemoveFilter && chips.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                {chips.map((chip) => (
                  <button
                    key={`${chip.key}-${chip.label}`}
                    type="button"
                    onClick={() => onRemoveFilter(chip)}
                    title="Search again without this"
                    className="group inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] py-0.5 pl-2.5 pr-1.5 text-[12px] text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
                  >
                    {chip.label}
                    <X className="size-3 opacity-40 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="min-w-0 truncate text-[13px] text-muted-foreground">
                {formatFilters(filters, laptops.length)}
              </div>
            )}
        </div>
        <LaptopTable
          laptops={laptops}
          visibleCols={visibleCols}
          toggleCol={toggleCol}
          sortBy={filters?.sort_by ?? "score"}
          sortOrder={filters?.sort_order ?? "desc"}
          isLocked
          density="compact"
          maxHeightClassName="max-h-[max(14rem,min(52vh,calc(100dvh-29rem)))]"
          containerClassName="rounded-none border-0 bg-transparent"
          onSortChange={NOOP}
        />
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.laptops === next.laptops &&
    prev.visibleCols === next.visibleCols &&
    prev.toggleCol === next.toggleCol &&
    prev.onRemoveFilter === next.onRemoveFilter &&
    prev.stats?.total === next.stats?.total;
});

const MessageItem = React.memo(function MessageItem({
  message,
  isSearching,
  visibleCols,
  toggleCol,
  onRemoveFilter,
}: {
  message: ChatMessage;
  isSearching: boolean;
  visibleCols: Set<string>;
  toggleCol: (key: string) => void;
  onRemoveFilter?: (chip: FilterChip) => void;
}) {
  const text = getTextContent(message);

  if (message.role === "user") {
    return (
      <div className={cn(CONTENT_LANE_CLASS, "flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300")}>
        <div className="max-w-[88%] rounded-2xl border border-white/10 bg-white/[0.075] px-4 py-3 text-[15px] leading-6 text-foreground shadow-lg backdrop-blur-xl sm:max-w-[70%]">
          <p className="whitespace-pre-wrap break-words">{text}</p>
        </div>
      </div>
    );
  }

  if (message.role !== "assistant" || !message.parts?.length) return null;

  const search = getSearchData(getSearchPart(message));
  const laptops = getLaptops(message);
  const filters = search?.filters ?? null;
  const stats = search?.stats ?? null;

  const hasText = text.length > 0;
  const showTable = Boolean(search) && laptops.length > 0;
  const planned = isSearching ? getPlannedFilters(message) : null;

  return (
    <div className="w-full space-y-4" data-answer>

      {planned && <SearchingPanel filters={planned} />}

      {/* Table first: locks layout before text streams in, prevents end-of-stream jump */}
      {showTable && (
        <ResultPanel laptops={laptops} filters={filters} stats={stats} visibleCols={visibleCols} toggleCol={toggleCol} onRemoveFilter={onRemoveFilter} />
      )}

      {hasText && (
        <div className={cn(CONTENT_LANE_CLASS, "animate-in fade-in duration-200")}>
          <div className="prose prose-invert max-w-none text-[15px] leading-7 text-foreground/88 prose-p:my-2 prose-strong:text-foreground prose-a:text-blue-300 prose-ul:my-2 prose-li:my-0">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return prev.message === next.message &&
    prev.isSearching === next.isSearching &&
    prev.visibleCols === next.visibleCols &&
    prev.toggleCol === next.toggleCol &&
    prev.onRemoveFilter === next.onRemoveFilter;
});

function loadSavedMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = sessionStorage.getItem("assistant_messages");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export default function AssistantPage() {
  const [inputValue, setInputValue] = useState("");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(DEFAULT_VISIBLE);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [lastSubmittedId, setLastSubmittedId] = useState<string | null>(null);
  const activeFiltersRef = useRef<LaptopFilters>({});
  const activeLanguageRef = useRef<string | undefined>(undefined);
  // The scroll animation in progress, and where it is heading
  const glideRef = useRef<{ frame: number; target: number } | null>(null);
  const hasRevealedRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const latestTurnRef = useRef<HTMLDivElement>(null);
  const answerEndRef = useRef<HTMLDivElement>(null);
  // True once the visitor scrolls by hand during an answer: from then on the page stays where they put it
  const userScrolledRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSearchIdRef = useRef<string | null>(null);

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({ transport });

  useEffect(() => {
    const saved = loadSavedMessages();
    if (saved.length > 0) {
      setMessages(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem("assistant_messages", JSON.stringify(messages));
    } else {
      sessionStorage.removeItem("assistant_messages");
    }
  }, [messages]);

  const typedMessages = messages as ChatMessage[];
  const isLoading = status === "submitted" || status === "streaming";
  const hasMessages = typedMessages.length > 0;
  const streamPhase = getStreamPhase(status, typedMessages);

  const toggleCol = useCallback((key: string) => {
    setVisibleCols((previous) => {
      if (previous.has(key) && CORE_COLS.has(key)) return previous;
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /**
   * Where the page should rest for the latest exchange, as scroll offsets:
   *   question: the question sits right under the page title
   *   answerTop: the answer starts right under the page title
   *   end:      the last line of the answer sits just above the composer
   */
  const measureLatest = useCallback(() => {
    const viewport = viewportRef.current;
    const turn = latestTurnRef.current;
    const end = answerEndRef.current;
    if (!viewport || !turn || !end) return null;

    const frame = viewport.getBoundingClientRect();
    const offsetOf = (element: Element, edge: "top" | "bottom") =>
      element.getBoundingClientRect()[edge] - frame.top + viewport.scrollTop;
    const topSpace = (titleRef.current?.offsetHeight ?? 56) + 8;
    const visibleHeight = viewport.clientHeight - (composerRef.current?.offsetHeight ?? 110) - 12;
    const answer = turn.querySelector("[data-answer]");

    return {
      question: offsetOf(turn, "top") - topSpace,
      answerTop: answer ? offsetOf(answer, "top") - topSpace : Number.POSITIVE_INFINITY,
      end: offsetOf(end, "bottom") - visibleHeight,
    };
  }, []);

  // "Near" means the end of the latest answer is on screen or close to it;
  // otherwise the "Jump to latest" button is offered.
  const syncNearBottom = useCallback(() => {
    const viewport = viewportRef.current;
    const spots = measureLatest();
    if (viewport && spots) setIsNearBottom(viewport.scrollTop > spots.end - 180);
  }, [measureLatest]);

  /**
   * Brings the latest exchange into view the way chat apps do: the question
   * goes to the top and the answer fills the space under it. If the answer is
   * taller than the screen, the page follows it down, but never past the point
   * where the answer's first line would leave the screen (`toEnd` lifts that
   * limit, for the "Jump to latest" button).
   */
  const revealLatest = useCallback((behavior: ScrollBehavior = "smooth", toEnd = false) => {
    const viewport = viewportRef.current;
    const spots = measureLatest();
    if (!viewport || !spots) return;
    const target = Math.max(0, spots.question, toEnd ? spots.end : Math.min(spots.end, spots.answerTop));
    if (Math.abs(viewport.scrollTop - target) <= 2) return;
    if (behavior !== "smooth") {
      viewport.scrollTop = target;
      return;
    }

    // Already gliding there: let it finish instead of starting over on every word of the answer
    const current = glideRef.current;
    if (current && Math.abs(current.target - target) <= 2) return;
    if (current) window.cancelAnimationFrame(current.frame);

    // A hand-made glide: the browser's own smooth scroll is too quick for a
    // whole exchange moving up the screen. A fresh move eases in and out; a
    // change of destination mid-way only eases out, so it never stalls.
    const from = viewport.scrollTop;
    const distance = target - from;
    const duration = Math.min(900, Math.max(450, Math.abs(distance) * 1.1));
    const ease = current
      ? (t: number) => 1 - (1 - t) ** 3
      : (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      viewport.scrollTop = from + distance * ease(progress);
      if (progress < 1 && !userScrolledRef.current) {
        glideRef.current = { frame: window.requestAnimationFrame(step), target };
      } else {
        glideRef.current = null;
        syncNearBottom();
      }
    };
    glideRef.current = { frame: window.requestAnimationFrame(step), target };
  }, [measureLatest, syncNearBottom]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    userScrolledRef.current = false;
    revealLatest(behavior, true);
    setIsNearBottom(true);
  }, [revealLatest]);

  // Runs when a question is sent and on every piece of the answer that arrives
  // (placeholder, table, each word). Most of the time nothing moves: the space
  // under the question was reserved, so the answer simply appears in view.
  useEffect(() => {
    if (userScrolledRef.current || typedMessages.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      // A conversation restored on page load is shown in place, not animated
      revealLatest(hasRevealedRef.current ? "smooth" : "auto");
      hasRevealedRef.current = true;
      if (!glideRef.current) syncNearBottom();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [revealLatest, status, syncNearBottom, typedMessages]);

  // Keep the columns and the follow-up context in sync with the latest search
  useEffect(() => {
    for (let index = typedMessages.length - 1; index >= 0; index -= 1) {
      const part = getSearchPart(typedMessages[index]);
      const search = getSearchData(part);
      if (!part || !search) continue;

      const searchId = part.id ?? typedMessages[index].id;
      if (searchId === lastSearchIdRef.current) return;
      lastSearchIdRef.current = searchId;
      activeFiltersRef.current = search.filters;
      activeLanguageRef.current = search.language;

      const timer = window.setTimeout(() => setVisibleCols(getSmartColumns(search.filters)), 0);
      return () => window.clearTimeout(timer);
    }
  }, [typedMessages]);

  const resetChat = useCallback(() => {
    stop();
    setMessages([]);
    setInputValue("");
    setVisibleCols(new Set(DEFAULT_VISIBLE));
    setLastSubmittedId(null);
    activeFiltersRef.current = {};
    activeLanguageRef.current = undefined;
    lastSearchIdRef.current = null;
    setIsNearBottom(true);
  }, [setMessages, stop]);

  const send = useCallback(async (text: string, extra: Record<string, unknown> = {}) => {
    if (!text || isLoading) return;

    setLastSubmittedId(`submitted-${Date.now()}`);
    setIsNearBottom(true);
    userScrolledRef.current = false;

    const previousQuestions = typedMessages
      .filter((message) => message.role === "user")
      .map(getTextContent)
      .slice(-3);

    await sendMessage(
      { text },
      { body: { question: text, previousQuestions, lastFilters: activeFiltersRef.current, ...extra } },
    );
  }, [isLoading, sendMessage, typedMessages]);

  const submitMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue("");
    await send(text);
  }, [inputValue, isLoading, send]);

  // One click on a filter of the latest result searches again without it
  const removeFilter = useCallback((chip: FilterChip) => {
    void send(`Without "${chip.label}"`, { removeFilter: chip.key, language: activeLanguageRef.current });
  }, [send]);

  // The latest exchange starts at the last question
  let latestTurnStart = 0;
  for (let index = typedMessages.length - 1; index >= 0; index -= 1) {
    if (typedMessages[index].role === "user") {
      latestTurnStart = index;
      break;
    }
  }

  const renderMessage = (message: ChatMessage, index: number) => (
    <MessageItem
      key={message.id}
      message={message}
      isSearching={streamPhase === "searching" && index === typedMessages.length - 1}
      visibleCols={visibleCols}
      toggleCol={toggleCol}
      onRemoveFilter={!isLoading && index === typedMessages.length - 1 ? removeFilter : undefined}
    />
  );

  const errorMessage = useMemo(() => {
    if (!error) return null;
    // The API answers errors with {"error": "..."} written for the user
    try {
      const parsed: unknown = JSON.parse(error.message);
      if (isRecord(parsed) && typeof parsed.error === "string") return parsed.error;
    } catch {
      // not JSON: fall through to the generic message
    }
    return "Something went wrong with this message. Please try again.";
  }, [error]);

  return (
    <div className="relative h-full bg-background text-foreground">
      <div
        ref={viewportRef}
        onScroll={() => {
          // Mid-glide the page is on its way to the answer: no button until it arrives
          if (!glideRef.current) syncNearBottom();
        }}
        onWheel={() => { userScrolledRef.current = true; }}
        onPointerDown={(event) => {
          // Dragging the scrollbar counts as scrolling by hand
          if (event.target === event.currentTarget) userScrolledRef.current = true;
        }}
        onTouchMove={() => { userScrolledRef.current = true; }}
        className="h-full overflow-y-scroll overflow-x-hidden custom-scrollbar [scrollbar-gutter:stable_both-edges]"
      >
        {/* Messages fade out under the header instead of being cut by it */}
        <div ref={titleRef} className="pointer-events-none sticky top-0 z-30 h-3">
          <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-background to-transparent" />
        </div>

        <div className="mx-auto max-w-[1100px] px-6 pb-8">
          <main className="relative flex flex-col" suppressHydrationWarning>
            {!hasMessages ? (
              <div className="flex min-h-[calc(100dvh-6.25rem)] items-center justify-center px-4 pb-[4.5rem]">
                <div className="w-full max-w-[900px] text-center">
                  <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Find your laptop</h2>
                  <p className="mx-auto mt-3 max-w-xl text-[14px] leading-6 text-muted-foreground">
                    Search by Brand, model, city, budget, or specs and the assistant will bring reliable items from the laptops database.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-7 px-0 pb-24 pt-4">
                {typedMessages.slice(0, latestTurnStart).map(renderMessage)}

                {/* The latest question and its answer. The reserved height is what lets the
                    question rise to the top of the screen before the answer exists. */}
                <div ref={latestTurnRef} className="min-h-[calc(100dvh-7rem)] space-y-7">
                  {typedMessages.slice(latestTurnStart).map((message, index) => renderMessage(message, latestTurnStart + index))}

                  <StreamingIndicator phase={streamPhase} />

                  {errorMessage && lastSubmittedId && <ErrorLine message={errorMessage} />}
                  <div ref={answerEndRef} className="!mt-0 h-px w-full" />
                </div>
              </div>
            )}
            <div ref={bottomRef} className="h-px w-full" style={{ overflowAnchor: "auto" }} />
          </main>
        </div>
      </div>

      {!isNearBottom && hasMessages && (
        <button
          type="button"
          onClick={() => scrollToLatest("smooth")}
          className="fixed bottom-[calc(112px+env(safe-area-inset-bottom))] left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/90 px-3 py-2 text-[12px] font-medium text-foreground shadow-2xl backdrop-blur-xl transition hover:bg-zinc-900"
        >
          <ArrowDown className="size-3.5" />
          Jump to latest
        </button>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-28 bg-gradient-to-t from-background to-transparent" />
      <div ref={composerRef} className="fixed inset-x-0 bottom-0 z-40 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className={LANE_CLASS}>
          {/* New chat sits beside the prompt bar: in the margin on wide screens, so the
              bar keeps the width of the results above it */}
          <div className="relative flex items-end gap-2">
            {hasMessages && (
              <button
                type="button"
                onClick={resetChat}
                aria-label="New chat"
                title="New chat"
                className="mb-4 shrink-0 cursor-pointer text-muted-foreground transition-colors duration-200 hover:text-foreground lg:absolute lg:bottom-4 lg:right-full lg:mb-0 lg:mr-3"
              >
                <CirclePlus className="size-7" strokeWidth={1.75} />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <ChatInput
                value={inputValue}
                isLoading={isLoading}
                onChange={setInputValue}
                onSubmit={submitMessage}
                onStop={stop}
              />
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/60 leading-relaxed">
            AI answers, powered by Groq · Not affiliated with Avito.ma
          </p>
        </div>
      </div>
    </div>
  );
}