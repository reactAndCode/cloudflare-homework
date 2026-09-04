import puppeteer from "@cloudflare/puppeteer";
import { tool } from "ai";
import z from "zod";

export function createAuditTools(env: Env) {
  return {
    auditSeo: tool({
      title: "auditSeo",
      description:
        "주어진 웹사이트 URL을 실제 브라우저로 방문하여 8가지 핵심 SEO 항목을 검사하고 점수 및 스크린샷을 반환합니다.",
      inputSchema: z.object({
        url: z
          .string()
          .describe("감사할 웹사이트 URL (예: https://example.com)"),
      }),
      execute: async ({ url }) => {
        let targetUrl = url.trim();
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          targetUrl = "https://" + targetUrl;
        }

        console.log(`[auditSeo] 감사 시작 Target URL: ${targetUrl}`);

        // 전체 실행에 대해 12초 하드 타임아웃 적용 (무한 대기 차단)
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("브라우저 렌더링 시간 초과 (12초 제한)")), 120000)
        );

        const auditLogic = async () => {
          let browser: any;
          try {
            console.log(`[auditSeo] Cloudflare Remote Browser 실행 시도...`);
            browser = await puppeteer.launch(env.BROWSER);

            console.log(`[auditSeo] 새 브라우저 탭 생성 및 뷰포트 설정...`);
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });

            console.log(`[auditSeo] 페이지 접속 중: ${targetUrl}`);
            await page.goto(targetUrl, {
              waitUntil: "domcontentloaded",
              timeout: 18000, // 8초 내 DOM 로드
            });

            console.log(`[auditSeo] DOM 8개 검사항목 계산 중...`);
            const evalResult = await page.evaluate(() => {
              const checks: {
                id: string;
                name: string;
                passed: boolean;
                foundValue: string;
                recommendation: string;
              }[] = [];

              // 1. <title> 존재 및 10~60자
              const titleEl = document.querySelector("title");
              const titleText = titleEl?.textContent?.trim() || "";
              const titleLen = titleText.length;
              const titlePassed = titleEl !== null && titleLen >= 10 && titleLen <= 60;
              checks.push({
                id: "title",
                name: "<title> 태그 (10~60자)",
                passed: titlePassed,
                foundValue: titleEl ? `"${titleText}" (${titleLen}자)` : "없음",
                recommendation: titlePassed
                  ? "적절함"
                  : titleEl
                    ? `제목 길이가 ${titleLen}자입니다. 10자 이상 60자 이하로 작성하세요.`
                    : "<title> 태그가 존재하지 않습니다.",
              });

              // 2. <meta name="description"> 존재 및 50~160자
              const descEl = document.querySelector('meta[name="description"]');
              const descContent = descEl?.getAttribute("content")?.trim() || "";
              const descLen = descContent.length;
              const descPassed = descEl !== null && descLen >= 50 && descLen <= 160;
              checks.push({
                id: "description",
                name: '<meta name="description"> (50~160자)',
                passed: descPassed,
                foundValue: descEl ? `"${descContent}" (${descLen}자)` : "없음",
                recommendation: descPassed
                  ? "적절함"
                  : descEl
                    ? `설명 길이가 ${descLen}자입니다. 50자 이상 160자 이하로 작성하세요.`
                    : '<meta name="description"> 태그가 존재하지 않습니다.',
              });

              // 3. 페이지에 <h1>이 정확히 하나인가
              const h1List = document.querySelectorAll("h1");
              const h1Count = h1List.length;
              const h1Passed = h1Count === 1;
              const h1Text = h1Count > 0 ? h1List[0].textContent?.trim() || "" : "";
              checks.push({
                id: "h1",
                name: "<h1> 태그 개수 (정확히 1개)",
                passed: h1Passed,
                foundValue: `<h1> 태그 ${h1Count}개 발견${h1Count === 1 ? ` ("${h1Text}")` : ""}`,
                recommendation: h1Passed
                  ? "적절함"
                  : h1Count === 0
                    ? "페이지에 <h1> 태그가 없습니다. 주요 제목에 <h1> 1개를 사용하세요."
                    : `페이지에 <h1> 태그가 ${h1Count}개 있습니다. 주요 제목 1개에만 <h1>을 사용하세요.`,
              });

              // 4. 모든 <img>에 alt 속성이 있는가
              const imgList = Array.from(document.querySelectorAll<HTMLImageElement>("img"));
              const totalImgs = imgList.length;
              const missingAltImgs = imgList.filter(
                (img) => !img.hasAttribute("alt") || img.getAttribute("alt")?.trim() === ""
              );
              const imgPassed = totalImgs === 0 || missingAltImgs.length === 0;
              checks.push({
                id: "imgAlt",
                name: "<img> 태그 alt 속성 유무",
                passed: imgPassed,
                foundValue: `총 ${totalImgs}개 이미지 중 alt 누락 ${missingAltImgs.length}개`,
                recommendation: imgPassed
                  ? "적절함"
                  : `${missingAltImgs.length}개의 이미지에 alt 속성이 없거나 비어 있습니다. 접근성과 SEO를 위해 alt 속성을 추가하세요.`,
              });

              // 5. <meta property="og:title">과 <meta property="og:image">가 존재하는가
              const ogTitle = document.querySelector('meta[property="og:title"]');
              const ogImage = document.querySelector('meta[property="og:image"]');
              const ogTitleVal = ogTitle?.getAttribute("content") || "";
              const ogImageVal = ogImage?.getAttribute("content") || "";
              const ogPassed = !!(ogTitle && ogTitleVal) && !!(ogImage && ogImageVal);
              checks.push({
                id: "openGraph",
                name: "Open Graph (og:title, og:image)",
                passed: ogPassed,
                foundValue: `og:title: ${ogTitle ? `"${ogTitleVal}"` : "없음"}, og:image: ${ogImage ? `"${ogImageVal}"` : "없음"}`,
                recommendation: ogPassed
                  ? "적절함"
                  : "소셜 공유 최적화를 위해 <meta property=\"og:title\"> 및 <meta property=\"og:image\"> 태그를 추가하세요.",
              });

              // 6. <link rel="canonical">이 존재하는가
              const canonical = document.querySelector('link[rel="canonical"]');
              const canonicalHref = canonical?.getAttribute("href") || "";
              const canonicalPassed = !!(canonical && canonicalHref);
              checks.push({
                id: "canonical",
                name: "<link rel=\"canonical\"> 대표 URL",
                passed: canonicalPassed,
                foundValue: canonical ? `href="${canonicalHref}"` : "없음",
                recommendation: canonicalPassed
                  ? "적절함"
                  : "중복 콘텐츠 방지 및 대표 URL 지정을 위해 <link rel=\"canonical\" href=\"...\"> 태그를 작성하세요.",
              });

              // 7. <meta name="viewport">가 존재하는가
              const viewport = document.querySelector('meta[name="viewport"]');
              const viewportContent = viewport?.getAttribute("content") || "";
              const viewportPassed = !!(viewport && viewportContent);
              checks.push({
                id: "viewport",
                name: '<meta name="viewport"> 모바일 반응형',
                passed: viewportPassed,
                foundValue: viewport ? `content="${viewportContent}"` : "없음",
                recommendation: viewportPassed
                  ? "적절함"
                  : '모바일 반응형 웹을 위해 <meta name="viewport" content="width=device-width, initial-scale=1.0"> 태그를 추가하세요.',
              });

              // 8. <html>에 lang 속성이 있는가
              const htmlLang = document.documentElement.getAttribute("lang")?.trim() || "";
              const langPassed = htmlLang.length > 0;
              checks.push({
                id: "lang",
                name: "<html> 태그 lang 속성",
                passed: langPassed,
                foundValue: langPassed ? `lang="${htmlLang}"` : "lang 속성 없음",
                recommendation: langPassed
                  ? "적절함"
                  : '검색엔진 언어 감지 및 웹 접근성을 위해 <html lang="ko"> 형태로 lang 속성을 지정하세요.',
              });

              return checks;
            });

            console.log(`[auditSeo] 스크린샷 캡처 중...`);
            const screenshotBuffer = await page.screenshot({
              type: "jpeg",
              quality: 50,
            });

            let screenshotBase64 = "";
            if (screenshotBuffer) {
              if (typeof screenshotBuffer === "string") {
                screenshotBase64 = `data:image/jpeg;base64,${screenshotBuffer}`;
              } else {
                const base64Str = Buffer.from(screenshotBuffer).toString("base64");
                screenshotBase64 = `data:image/jpeg;base64,${base64Str}`;
              }
            }

            console.log(`[auditSeo] 브라우저 종료 및 결과 리턴!`);
            await browser.close();

            const passedCount = evalResult.filter((c: any) => c.passed).length;
            const score = passedCount * 12.5;

            return {
              url: targetUrl,
              score,
              passedCount,
              totalCount: 8,
              checks: evalResult,
              screenshot: screenshotBase64,
            };
          } catch (err: any) {
            if (browser) {
              try {
                await browser.close();
              } catch (_) { }
            }
            throw err;
          }
        };

        try {
          return await Promise.race([auditLogic(), timeoutPromise]);
        } catch (error: any) {
          console.error(`[auditSeo] 에러 발생:`, error?.message);
          return {
            url: targetUrl,
            error: true,
            message: `웹사이트 방문 실패: ${error?.message || "페이지에 접속할 수 없거나 시간 초과되었습니다."}`,
          };
        }
      },
    }),
  };
}
