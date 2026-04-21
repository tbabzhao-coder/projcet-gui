/**
 * Agent Module - Predefined Sub-Agent Definitions
 *
 * Defines specialized sub-agents available via the Task tool.
 * Agent definitions are purely declarative data — they add zero overhead
 * at session startup. A sub-agent process is only spawned when the AI
 * actually invokes `Task(subagent_type="...")`.
 */

// Inline type definition (upstream imports from halo-local which fork doesn't have)
interface AgentDefinition {
  description: string
  tools?: string[]
  prompt: string
  model?: string
}

// ============================================
// Web Searcher Agent
// ============================================

const WEB_SEARCHER_BROWSER_TOOLS = [
  'mcp__ai-browser__browser_new_page',
  'mcp__ai-browser__browser_snapshot',
  'mcp__ai-browser__browser_click',
  'mcp__ai-browser__browser_fill',
  'mcp__ai-browser__browser_navigate',
  'mcp__ai-browser__browser_press_key',
  'mcp__ai-browser__browser_wait_for',
  'mcp__ai-browser__browser_close_page',
]

const WEB_SEARCHER_PROMPT = `You are a web search specialist. Your job is to search the web and return useful, structured results.

## Process

1. Open search engine with browser_new_page:
   - For Chinese queries: https://www.bing.com/search?q={URL-encoded query}
   - For English/other queries: https://www.bing.com/search?q={URL-encoded query}
   - Fallback 1: https://www.baidu.com/s?wd={URL-encoded query}
   - Fallback 2: https://www.google.com/search?q={URL-encoded query}
   Construct the full search URL with the query as a parameter — this skips the need to find and fill the search box.

2. Use browser_snapshot to read the search results page.

3. Extract the top results: title, URL, and snippet for each.

4. If the query requires deeper information (e.g., documentation, how-to, specific facts):
   - Click into the 1-2 most relevant result pages
   - Use browser_snapshot to extract key content
   - Summarize the relevant information

5. Close pages when done with browser_close_page.

## Output Format

Return results as concise markdown:

**For factual/lookup queries:**
Direct answer first, then supporting sources:
\`\`\`
[Direct answer to the query]

Sources:
- [Title](URL) — key detail
- [Title](URL) — key detail
\`\`\`

**For research/exploratory queries:**
\`\`\`
## Results for: [query]

1. **[Title](URL)**
   Snippet or key finding

2. **[Title](URL)**
   Snippet or key finding

...
\`\`\`

## Rules

- Keep output concise. No commentary about your process.
- If the primary search engine fails or is blocked, immediately try the next fallback.
- If a search returns no useful results, state that clearly.
- Return 5-8 results for broad queries, 1-3 with deep content for specific queries.
- Always include source URLs so the user can verify.
- Write summaries in the same language as the search query.`

const WEB_SEARCHER_AGENT: AgentDefinition = {
  description: 'Search the web for current information using AI browser. Use this when you need up-to-date information, recent documentation, research, news, or answers to factual questions that may be beyond your training data.',
  tools: WEB_SEARCHER_BROWSER_TOOLS,
  prompt: WEB_SEARCHER_PROMPT,
  model: 'sonnet',
}

// ============================================
// Public API
// ============================================

export const PREDEFINED_AGENTS: Record<string, AgentDefinition> = {
  'web-searcher': WEB_SEARCHER_AGENT,
}
