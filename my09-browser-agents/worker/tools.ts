import { tool } from "ai";
import z from "zod";

/**
 * 웹페이지 방문 및 텍스트 추출 도구
 */
export const browseUrl = tool({
  title: "browseUrl",
  description: "지정된 웹 페이지 URL을 방문하여 제목 및 내용을 가져옵니다.",
  inputSchema: z.object({
    url: z.string().describe("방문할 웹사이트의 전체 URL (예: https://example.com)"),
  }),
  execute: async ({ url }) => {
    try {
      const targetUrl = url.startsWith("http") ? url : `https://${url}`;
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,text/plain",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          url: targetUrl,
        };
      }

      const html = await response.text();
      // 간단한 타이틀 추출
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "Untitled";

      // HTML 태그 제거 및 텍스트 추출 (최대 1500자)
      const cleanText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500);

      return {
        success: true,
        url: targetUrl,
        title,
        contentSnippet: cleanText,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message ?? "Failed to fetch webpage",
        url,
      };
    }
  },
});

/**
 * 웹 검색 도구
 */
export const searchWeb = tool({
  title: "searchWeb",
  description: "웹에서 정보를 검색합니다.",
  inputSchema: z.object({
    query: z.string().describe("검색할 키워드 또는 질의어"),
  }),
  execute: async ({ query }) => {
    try {
      // DuckDuckGo Lite API 또는 관련 질의 결과 시뮬레이션
      const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(endpoint);
      const data: any = await res.json();

      const results = [];
      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText,
          source: data.AbstractURL,
        });
      }

      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 3)) {
          if (topic.Text) {
            results.push({
              title: topic.Text.slice(0, 50),
              snippet: topic.Text,
              source: topic.FirstURL,
            });
          }
        }
      }

      if (results.length === 0) {
        results.push({
          title: `검색 결과: ${query}`,
          snippet: `'${query}'에 대한 주요 검색 결과를 확인했습니다. 브라우저를 통해 더 구체적인 페이지(${query}) 탐색이 가능합니다.`,
          source: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        });
      }

      return {
        query,
        results,
      };
    } catch (err: any) {
      return {
        query,
        error: err.message,
        results: [
          {
            title: `검색어: ${query}`,
            snippet: `'${query}' 관련 웹 검색 탐색 요청이 등록되었습니다.`,
            source: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          },
        ],
      };
    }
  },
});

/**
 * 브라우저 액션 실행 (사용자 승인 필수)
 */
export const executeBrowserAction = tool({
  title: "executeBrowserAction",
  description: "브라우저에서 특정 URL 이동, 스크린샷 캡처 또는 폼 제출 등 민감한 브라우저 자동화 작업을 수행합니다. 사용자 승인이 필요합니다.",
  inputSchema: z.object({
    action: z.enum(["navigate", "screenshot", "click", "submit"]).describe("수행할 브라우저 동작"),
    targetUrl: z.string().describe("대상 웹사이트 URL"),
    reason: z.string().describe("이 동작을 수행해야 하는 이유"),
  }),
  execute: async ({ action, targetUrl, reason }) => {
    return {
      success: true,
      action,
      targetUrl,
      reason,
      status: "executed",
      message: `[승인 완료] ${targetUrl} 에 대한 '${action}' 브라우저 작업이 성공적으로 실행되었습니다.`,
      timestamp: new Date().toISOString(),
    };
  },
  needsApproval: () => true, // 사용자 승인(Approval) 필수 설정
});

/**
 * 에이전트 도구 모음 생성기
 */
export const createBrowserTools = () => {
  return {
    browseUrl,
    searchWeb,
    executeBrowserAction,
  };
};
