/**
 * Client for Northeastern's Banner 9 Self-Service API.
 *
 * This is the same public endpoint SearchNEU's scraper reads. No authentication is required, but
 * the session handshake is mandatory and undocumented: a fresh session is refused by
 * `searchResults` until it has POSTed a term to `/term/search`.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { bannerSearchResponse, termList, type BannerSection } from "./schema.js";

const BASE = "https://nubanner.neu.edu/StudentRegistrationSsb/ssb";

/** Banner caps `pageMaxSize` at 500; a full term is ~20 requests. */
const PAGE_SIZE = 500;

/** Courtesy delay between requests. A daily scrape is ~20 requests total. */
const REQUEST_DELAY_MS = 400;

const USER_AGENT =
  "vacantNEU/0.1 (Northeastern classroom availability; +https://github.com/vacantneu)";

export interface BannerTerm {
  code: string;
  description: string;
}

/**
 * Holds the JSESSIONID / nubanner-cookie pair across requests.
 * Node's fetch has no cookie jar, so we track Set-Cookie manually.
 */
class CookieJar {
  private jar = new Map<string, string>();

  absorb(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";")[0];
      const eq = pair?.indexOf("=") ?? -1;
      if (!pair || eq < 1) continue;
      this.jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

export class BannerClient {
  private cookies = new CookieJar();
  private authorizedTerm: string | null = null;

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      ...(init?.headers as Record<string, string>),
    };
    const cookie = this.cookies.header();
    if (cookie) headers["Cookie"] = cookie;

    const response = await this.retry(() => fetch(`${BASE}${path}`, { ...init, headers }));
    this.cookies.absorb(response);
    return response;
  }

  /** Retries transient failures with exponential backoff. Banner is occasionally flaky. */
  private async retry(fn: () => Promise<Response>, attempts = 4): Promise<Response> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fn();
        if (response.ok) return response;
        // 4xx other than 429 will not fix themselves; fail fast.
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`Banner returned ${response.status} ${response.statusText}`);
        }
        lastError = new Error(`Banner returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      if (i < attempts - 1) await sleep(500 * 2 ** i);
    }
    throw new Error(`Banner request failed after ${attempts} attempts: ${String(lastError)}`);
  }

  private async json(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.request(path, init);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      // Banner answers with an HTML error page when the session has lapsed.
      throw new Error(`Expected JSON from ${path} but got: ${text.slice(0, 200)}`);
    }
  }

  /** Lists terms, newest first. */
  async getTerms(max = 20): Promise<BannerTerm[]> {
    const data = await this.json(`/classSearch/getTerms?searchTerm=&offset=1&max=${max}`);
    return termList.parse(data);
  }

  /**
   * Performs the session handshake for a term.
   * Must be called before {@link getSections}, and again if the session lapses mid-scrape.
   */
  async authorizeTerm(term: string): Promise<void> {
    // Priming GET establishes the session cookies.
    await this.request("/classSearch/classSearch");
    const body = new URLSearchParams({
      term,
      studyPath: "",
      studyPathText: "",
      startDatepicker: "",
      endDatepicker: "",
    });
    await this.json("/term/search?mode=search", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    this.authorizedTerm = term;
  }

  /**
   * Fetches every section in a term.
   *
   * `searchResults` accepts no subject filter, so one paginated sweep covers the whole catalog
   * rather than iterating 200+ subject codes.
   */
  async getSections(term: string, onProgress?: (got: number, total: number) => void) {
    if (this.authorizedTerm !== term) await this.authorizeTerm(term);

    const sections: BannerSection[] = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const query = new URLSearchParams({
        txt_term: term,
        pageOffset: String(offset),
        pageMaxSize: String(PAGE_SIZE),
        sortColumn: "subjectDescription",
        sortDirection: "asc",
      });
      const parsed = bannerSearchResponse.parse(
        await this.json(`/searchResults/searchResults?${query}`),
      );

      if (!parsed.success) throw new Error(`Banner reported failure for term ${term}`);

      total = parsed.totalCount;
      sections.push(...parsed.data);
      onProgress?.(sections.length, total);

      // Defensive: a page returning nothing while more are claimed would otherwise spin forever.
      if (parsed.data.length === 0) break;
      offset += PAGE_SIZE;
      if (offset < total) await sleep(REQUEST_DELAY_MS);
    }

    return sections;
  }
}
