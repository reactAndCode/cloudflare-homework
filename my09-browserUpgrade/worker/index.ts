import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createBrowserRuntime } from "agents/browser/ai";
import { convertToModelMessages, isLoopFinished, streamText, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

export { CodemodeRuntime } from "@cloudflare/codemode";

// Base64 문자열을 Uint8Array 바이트 배열로 변환하는 유틸리티
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// HTML 문자열에서 script/style 태그를 제거하고 텍스트 및 마크다운 링크([text](href))로 변환하는 유틸리티
function parseHtmlToMarkdownText(html: string): string {
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "");

  // <a href="...">text</a> 형태를 [text](href) 마크다운으로 변환
  cleaned = cleaned.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    if (!cleanText) return "";
    return ` [${cleanText}](${href}) `;
  });

  // 나머지 모든 HTML 태그 제거
  const pureText = cleaned.replace(/<[^>]+>/g, " ");

  // 공백 정돈
  return pureText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .slice(0, 4500); // 상위 4,500자로 제한하여 반환
}

// 메모리 내 증거 저장소 (R2 및 In-memory Fallback 보장)
const evidenceStore = new Map<string, { buffer: Uint8Array; contentType: string; url: string; timestamp: number }>();
let latestLiveScreenshot: Uint8Array | null = null;

const SYSTEM_PROMPT = `당신은 단일 브라우저 세션을 공유하며 탐색 상황에 따라 **webFetch**와 **readPage** 등 최적의 도구를 선택하여 웹사이트(예: nomadcoders.co 등)를 자율 탐색하는 'Autonomous Web Browsing AI Agent'입니다.

[사용 가능한 4가지 도구 및 활용 가이드]
1. ⚡ **webFetch({ url })**: 브라우저 렌더링 없이 직접 HTTP 요청으로 마크다운 링크([text](url))와 텍스트를 고속으로 추출합니다. 빠른 텍스트 확인, 특정 URL 정보 수집, 가격 조회 시 선택하세요.
2. 📖 **readPage({ url? })**: 브라우저 DOM 텍스트와 모든 클릭 가능 링크 목록({ text, href }[])을 렌더링된 상태에서 읽어옵니다. 페이지 구조 파악, 브라우저 기반 탐색 시 선택하세요.
3. 🔗 **followLink({ href })**: 지정한 href URL로 페이지를 이동하고, 이동 후 스크린샷을 타임스탬프 기반 증거 경로(/evidence/<key>)에 자동 기록합니다.
4. 📸 **screenshot()**: 요청 시 현재 페이지 스크린샷을 찍어 증거 저장소에 기록합니다.

[도구 선택 및 탐색 루프 원칙]
- 탐색 요구사항에 따라 **webFetch(url)** 또는 **readPage(url)** 중 원하는 도구를 자유롭게 선택하거나 상황에 맞춰 조합하여 사용하세요.
- **최대 5회(Max 5 Steps)** 까지만 도구 호출/이동을 수행하고, 5회가 되거나 답을 찾으면 탐색을 마치고 결과를 보고하세요.
- 답변 작성 시 **🎯 [최종 정답]**과 함께 **📍 [탐색 경로 및 수집 정보]**를 명확히 제시하세요.
`;

export class BrowserAgent extends AIChatAgent<Env> {
  private async saveEvidence(screenshotBuffer: Uint8Array): Promise<{ key: string; url: string }> {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const key = `evidence-${timestamp}-${randomSuffix}.png`;
    const evidenceUrl = `/evidence/${key}`;

    latestLiveScreenshot = screenshotBuffer;

    try {
      if ((this.env as any).EVIDENCE_BUCKET) {
        await (this.env as any).EVIDENCE_BUCKET.put(key, screenshotBuffer, {
          httpMetadata: { contentType: "image/png" },
        });
      }
    } catch (e) {
      console.warn(`[Evidence Save Warning] R2 Fallback:`, e);
    }

    evidenceStore.set(key, {
      buffer: screenshotBuffer,
      contentType: "image/png",
      url: evidenceUrl,
      timestamp,
    });

    console.log(`[Evidence Saved] 📸 스크린샷 저장 완료: ${key}`);
    return { key, url: evidenceUrl };
  }

  async closeBrowserSession() {
    console.log(`[BrowserAgent DO] 🔒 브라우저 세션 닫기 실행`);
    const { connector } = createBrowserRuntime({
      ctx: this.ctx,
      browser: this.env.BROWSER,
      loader: undefined as any,
    });
    await connector.closeSession();
    return { success: true, message: "브라우저 세션이 성공적으로 닫혔습니다." };
  }

  async onChatMessage() {
    console.log(
      `[BrowserAgent DO onChatMessage] 📩 대화 수신 (메시지 총: ${this.messages.length}개)`
    );

    const workersAi = createWorkersAI({ binding: this.env.AI });

    const { tools: browserTools } = createBrowserRuntime({
      ctx: this.ctx,
      browser: this.env.BROWSER,
      loader: undefined as any,
    });

    // --- 1) webFetch(url) 빠른 HTTP 텍스트/마크다운 추출 커스텀 도구 ---
    const webFetchTool = tool({
      description:
        "지정한 URL의 웹페이지 HTML을 직접 가져와 브라우저 렌더링 없이 마크다운 링크([text](url)) 및 텍스트 형태로 신속하게 추출합니다. 가격 및 텍스트 검색 시 선택 가능합니다.",
      inputSchema: z.object({
        url: z.string().describe("가져올 웹페이지 URL (예: https://nomadcoders.co/react-masterclass)"),
      }),
      execute: async ({ url }) => {
        console.log(`[Tool: webFetch] ⚡ direct fetch 실행: ${url}`);
        let targetUrl = url.trim();
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          targetUrl = "https://" + targetUrl;
        }

        try {
          const res = await fetch(targetUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          });

          if (!res.ok) {
            return {
              error: true,
              status: res.status,
              message: `HTTP 요청 실패 (상태 코드: ${res.status})`,
            };
          }

          const htmlText = await res.text();
          const markdownSnippet = parseHtmlToMarkdownText(htmlText);

          console.log(`[Tool: webFetch] ✅ 성공 - 텍스트 길이: ${markdownSnippet.length}자`);
          return {
            success: true,
            fetchedUrl: targetUrl,
            contentSnippet: markdownSnippet,
          };
        } catch (err: any) {
          console.error(`[Tool: webFetch] 에러 발생:`, err);
          return {
            error: true,
            message: `HTTP fetch 실패: ${err?.message || err}`,
          };
        }
      },
    });

    // --- 2) readPage() 커스텀 도구 ---
    const readPageTool = tool({
      description:
        "현재 브라우저 페이지의 텍스트와 모든 링크({ text, href }[])를 반환합니다. 브라우저 렌더링 기반 탐색 시 선택 가능합니다.",
      inputSchema: z.object({
        url: z.string().optional().describe("시작 접속 URL (기본값: 현재 페이지)"),
      }),
      execute: async ({ url }) => {
        console.log(`[Tool: readPage] 📖 페이지 읽기 실행: ${url || "현재 페이지"}`);
        
        if (url && (browserTools as any).browser_navigate) {
          await (browserTools as any).browser_navigate.execute({ url });
        }

        let pageData: any = { bodyText: "", links: [] };
        if ((browserTools as any).browser_extract) {
          pageData = await (browserTools as any).browser_extract.execute({
            instruction: "Extract the main text snippet and all anchor link hrefs and texts",
          });
        }

        let screenshotRes: any = null;
        if ((browserTools as any).browser_screenshot) {
          screenshotRes = await (browserTools as any).browser_screenshot.execute({});
          if (screenshotRes?.data) {
            const buffer = base64ToUint8Array(screenshotRes.data);
            latestLiveScreenshot = buffer;
          }
        }

        return {
          pageTextSnippet: pageData,
          screenshotCaptured: !!screenshotRes,
        };
      },
    });

    // --- 3) followLink(href) 커스텀 도구 ---
    const followLinkTool = tool({
      description:
        "지정한 href URL로 이동한 뒤, 새 페이지의 스크린샷을 타임스탬프가 포함된 키로 R2/증거저장소(/evidence/<key>)에 저장합니다.",
      inputSchema: z.object({
        href: z.string().describe("이동할 링크 href URL"),
      }),
      execute: async ({ href }) => {
        console.log(`[Tool: followLink] 🔗 링크 이동: ${href}`);
        if ((browserTools as any).browser_navigate) {
          await (browserTools as any).browser_navigate.execute({ url: href });
        }

        let evidence = { key: "", url: "" };
        if ((browserTools as any).browser_screenshot) {
          const screenshotRes = await (browserTools as any).browser_screenshot.execute({});
          if (screenshotRes?.data) {
            const buffer = base64ToUint8Array(screenshotRes.data);
            evidence = await this.saveEvidence(buffer);
          }
        }

        return {
          success: true,
          evidenceKey: evidence.key,
          evidenceUrl: evidence.url,
          message: `페이지 이동 성공: ${href}`,
        };
      },
    });

    // --- 4) screenshot() 커스텀 도구 ---
    const screenshotTool = tool({
      description: "요청 시 현재 페이지를 R2/증거저장소(/evidence/<key>)에 캡처합니다.",
      inputSchema: z.object({}),
      execute: async () => {
        console.log(`[Tool: screenshot] 📸 스크린샷 캡처 중...`);
        let evidence = { key: "", url: "" };
        if ((browserTools as any).browser_screenshot) {
          const screenshotRes = await (browserTools as any).browser_screenshot.execute({});
          if (screenshotRes?.data) {
            const buffer = base64ToUint8Array(screenshotRes.data);
            evidence = await this.saveEvidence(buffer);
          }
        }

        return {
          success: true,
          evidenceKey: evidence.key,
          evidenceUrl: evidence.url,
        };
      },
    });

    const primaryModel = "@cf/zai-org/glm-4.7-flash";
    const fallbackModel = "@cf/qwen/qwen3.8-27b";

    console.log(`[BrowserAgent DO] 🤖 Workers AI streamText() 실행...`);

    try {
      const result = streamText({
        model: workersAi(primaryModel),
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(this.messages),
        tools: {
          webFetch: webFetchTool,
          readPage: readPageTool,
          followLink: followLinkTool,
          screenshot: screenshotTool,
        },
        stopWhen: isLoopFinished(),
      });
      return result.toUIMessageStreamResponse();
    } catch (err: any) {
      console.warn(`[BrowserAgent DO] Primary 모델 에러 -> Fallback 모델(${fallbackModel}) 전환:`, err?.message || err);
      const fallbackResult = streamText({
        model: workersAi(fallbackModel),
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(this.messages),
        tools: {
          webFetch: webFetchTool,
          readPage: readPageTool,
          followLink: followLinkTool,
          screenshot: screenshotTool,
        },
        stopWhen: isLoopFinished(),
      });
      return fallbackResult.toUIMessageStreamResponse();
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1) /evidence/<key> 스크린샷 이미지 프록시 라우팅
    if (url.pathname.startsWith("/evidence/")) {
      const key = url.pathname.replace("/evidence/", "");
      console.log(`[Worker fetch] 🖼️ 증거 이미지 서빙: ${key}`);

      if (evidenceStore.has(key)) {
        const ev = evidenceStore.get(key)!;
        return new Response(ev.buffer as unknown as BodyInit, {
          headers: {
            "Content-Type": ev.contentType,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }

      try {
        if ((env as any).EVIDENCE_BUCKET) {
          const object = await (env as any).EVIDENCE_BUCKET.get(key);
          if (object) {
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set("etag", object.httpEtag);
            headers.set("Content-Type", "image/png");
            return new Response(object.body, { headers });
          }
        }
      } catch (e) {
        console.warn(`R2 fetch error for ${key}:`, e);
      }

      return new Response("Evidence Image Not Found", { status: 404 });
    }

    // 2) /live-view 에이전트 Chrome 탭 실시간 라이브 뷰 스트림/이미지 엔드포인트
    if (url.pathname === "/live-view" || url.pathname === "/live-view/image") {
      if (latestLiveScreenshot) {
        return new Response(latestLiveScreenshot as unknown as BodyInit, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }
      return new Response("No active screenshot available yet.", { status: 200 });
    }

    // 3) /agents/ 경로 라우팅
    if (url.pathname.startsWith("/agents/")) {
      const agentResponse = await routeAgentRequest(request, env);
      if (agentResponse) return agentResponse;
    }

    // 4) 정적 자산 서빙
    const assets = (env as unknown as { ASSETS?: { fetch: (req: typeof request) => Promise<Response> } }).ASSETS;
    if (assets) {
      return await assets.fetch(request);
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
