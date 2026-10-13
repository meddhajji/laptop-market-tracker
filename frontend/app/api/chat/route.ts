import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { cleanFilters, mergeFilters } from "@/lib/chat/filters";
import { interpret, offTopicReply, streamSummary, UNAVAILABLE_REPLY } from "@/lib/chat/llm";
import { checkRateLimit, clientIp } from "@/lib/chat/rate-limit";
import { parseChatRequest } from "@/lib/chat/request";
import { runSearch } from "@/lib/chat/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * Chat endpoint of the assistant.
 *
 *   1. validate the request and apply rate limits
 *   2. a model turns the question into structured filters (never SQL)
 *   3. the filters are sanitized and run as a parameterized query
 *   4. the rows go straight to the browser; a model writes a short summary
 *      from the numbers alone
 *
 * Every step has a non-AI fallback, so the endpoint degrades to a plain
 * search instead of failing when the model provider is unavailable.
 */
const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export async function POST(req: Request) {
    const parsed = parseChatRequest(await req.text());
    if (!parsed.ok) return json(parsed.status, { error: parsed.error });

    let limit;
    try {
        limit = await checkRateLimit(clientIp(req));
    } catch (error) {
        console.error("[chat] rate limit check failed:", error);
        return json(503, { error: "The assistant is temporarily unavailable. Please try again shortly." });
    }
    if (!limit.ok) {
        const error = limit.reason === "global"
            ? "The assistant has reached its daily capacity. It resets at midnight UTC; the dashboard still has every listing."
            : "You're sending messages too quickly. Please wait a little and try again.";
        return json(429, { error }, { "Retry-After": String(limit.retryAfterSeconds) });
    }

    const { question, previousQuestions, lastFilters, removeFilter, language } = parsed.request;

    const stream = createUIMessageStream({
        execute: async ({ writer }) => {
            const textId = `text-${Date.now()}`;
            let textOpen = false;
            const say = (delta: string) => {
                if (!textOpen) {
                    writer.write({ type: "text-start", id: textId });
                    textOpen = true;
                }
                writer.write({ type: "text-delta", id: textId, delta });
            };

            writer.write({ type: "start" });

            // Removing a filter from the results panel is already a structured request: no model needed
            const removal = removeFilter
                ? { drop: removeFilter === "sort_by" ? ["sort_by", "sort_order"] : [removeFilter], goal: "the same search with one filter removed", language: language ?? "en" }
                : null;
            const interpretation = removal ? null : await interpret({ question, previousQuestions, lastFilters });
            if (!removal && !interpretation) {
                say(UNAVAILABLE_REPLY);
            } else if (interpretation?.kind === "other") {
                say(offTopicReply(interpretation));
            } else {
                const requested = cleanFilters(interpretation?.filters);
                const filters = removal
                    ? mergeFilters(lastFilters, {}, removal.drop)
                    : interpretation?.follow_up ? mergeFilters(lastFilters, requested, interpretation.drop) : requested;
                const answering = removal ?? interpretation!;
                const searchId = `search-${Date.now()}`;
                // Sent before the query runs, so the page can show what was understood while it searches
                writer.write({ type: "data-plan", id: `plan-${searchId}`, data: { filters } });
                const { laptops, stats } = await runSearch(filters);

                writer.write({ type: "data-laptops", id: `laptops-${searchId}`, data: laptops });
                writer.write({ type: "data-search", id: searchId, data: { filters, stats, language: answering.language } });

                await streamSummary({ interpretation: answering, filters, stats, laptops }, say);
            }

            if (textOpen) writer.write({ type: "text-end", id: textId });
            writer.write({ type: "finish" });
        },
        onError(error) {
            console.error("[chat] stream failed:", error);
            return "The search failed. Please try again.";
        },
    });

    return createUIMessageStreamResponse({ stream });
}
