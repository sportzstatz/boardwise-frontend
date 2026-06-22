// @ts-check
(function () {
  const DEFAULT_API_BASE = "https://api.useboardwise.com";

  /**
   * @typedef {string | URLSearchParams | Record<string, string | number | boolean | null | undefined | Array<string | number | boolean | null | undefined>>} ApiQuery
   */

  const ENDPOINTS = Object.freeze({
    me: "/api/v1/me",
    magicLinkStart: "/api/v1/auth/magic-link/start",
    magicLinkVerify: "/api/v1/auth/magic-link/verify",
    logout: "/api/v1/auth/logout",
    landingMlb: "/api/v1/public/landing/mlb",
    mlbBoardCurrent: "/api/v1/boards/mlb/current",
    mlbBoardDate: "/api/v1/boards/mlb/",
    performanceFilters: "/api/v1/performance/filters",
    performanceSummary: "/api/v1/performance/summary",
    performanceBreakdown: "/api/v1/performance/breakdown",
    performancePicks: "/api/v1/performance/picks",
    performanceBookComparison: "/api/v1/performance/book-comparison",
  });

  class BoardWiseApiError extends Error {
    /**
     * @param {string} message
     * @param {{ status: number; statusText: string; url: string; body?: unknown }} details
     */
    constructor(message, details) {
      super(message);
      this.name = "BoardWiseApiError";
      this.status = details.status;
      this.statusText = details.statusText;
      this.url = details.url;
      this.body = details.body;
    }
  }

  function apiBase() {
    return String(window.BOARDWISE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
  }

  /**
   * @param {string} path
   * @param {ApiQuery} [query]
   * @returns {string}
   */
  function buildUrl(path, query) {
    const url = new URL(path, `${apiBase()}/`);
    const queryString = serializeQuery(query);
    if (queryString) url.search = queryString;
    return url.toString();
  }

  /**
   * @param {ApiQuery | undefined} query
   * @returns {string}
   */
  function serializeQuery(query) {
    if (!query) return "";
    if (typeof query === "string") return query.replace(/^\?/, "");
    if (query instanceof URLSearchParams) return query.toString();

    const params = new URLSearchParams();
    if (typeof query !== "object") return "";

    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") continue;
      if (Array.isArray(value)) {
        const values = value
          .filter((item) => item !== null && item !== undefined && item !== "")
          .map((item) => String(item));
        if (values.length) params.set(key, values.join(","));
        continue;
      }
      params.set(key, String(value));
    }
    return params.toString();
  }

  /**
   * @param {Response} response
   * @returns {Promise<unknown>}
   */
  async function readJson(response) {
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_err) {
      return text;
    }
  }

  /**
   * @param {string} path
   * @param {{
   *   method?: string;
   *   query?: ApiQuery;
   *   body?: unknown;
   *   credentials?: RequestCredentials;
   *   cache?: RequestCache;
   * }} [options]
   * @returns {Promise<unknown>}
   */
  async function jsonRequest(path, options = {}) {
    const url = buildUrl(path, options.query);
    const init = /** @type {RequestInit & { headers: Record<string, string> }} */ ({
      method: options.method || "GET",
      credentials: options.credentials || "omit",
      headers: {
        Accept: "application/json",
      },
    });
    if (options.cache) init.cache = options.cache;
    if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, init);
    const body = await readJson(response);
    if (!response.ok) {
      throw new BoardWiseApiError(`${response.status} ${response.statusText}`, {
        status: response.status,
        statusText: response.statusText,
        url,
        body,
      });
    }
    return body;
  }

  /**
   * @param {string} prefix
   * @param {string | undefined} targetDate
   * @param {string} currentPath
   * @returns {string}
   */
  function boardPath(prefix, targetDate, currentPath) {
    const date = String(targetDate || "").trim();
    return date ? `${prefix}${encodeURIComponent(date)}` : currentPath;
  }

  const client = Object.freeze({
    ApiError: BoardWiseApiError,
    endpoints: ENDPOINTS,
    buildUrl,
    serializeQuery,

    getMe() {
      return jsonRequest(ENDPOINTS.me, {
        credentials: "include",
        cache: "no-store",
      });
    },

    getMlbLanding() {
      return jsonRequest(ENDPOINTS.landingMlb, {
        credentials: "omit",
      });
    },

    /**
     * @param {{ email: string; return_to?: string; turnstile_token?: string }} payload
     */
    startMagicLink(payload) {
      return jsonRequest(ENDPOINTS.magicLinkStart, {
        method: "POST",
        credentials: "include",
        body: payload,
      });
    },

    /**
     * @param {string} token
     */
    verifyMagicLink(token) {
      return jsonRequest(ENDPOINTS.magicLinkVerify, {
        method: "POST",
        credentials: "include",
        body: { token },
      });
    },

    logout() {
      return jsonRequest(ENDPOINTS.logout, {
        method: "POST",
        credentials: "include",
      });
    },

    /**
     * @param {string} [targetDate]
     * @param {{ model?: string }} [options]
     */
    getMlbBoard(targetDate, options = {}) {
      return jsonRequest(
        boardPath(ENDPOINTS.mlbBoardDate, targetDate, ENDPOINTS.mlbBoardCurrent),
        {
          query: options.model ? { model: options.model } : undefined,
          credentials: "include",
          cache: "no-store",
        }
      );
    },

    /**
     * @param {string} [sport]
     * @param {{ model_family?: string, performance_scope?: string }} [options]
     */
    getPerformanceFilters(sport, options = {}) {
      const query = sport || options.model_family || options.performance_scope
        ? { sport, model_family: options.model_family, performance_scope: options.performance_scope }
        : undefined;
      return jsonRequest(ENDPOINTS.performanceFilters, {
        query,
        credentials: "include",
        cache: "no-store",
      });
    },

    /**
     * @param {ApiQuery} query
     */
    getPerformanceSummary(query) {
      return jsonRequest(ENDPOINTS.performanceSummary, {
        query,
        credentials: "include",
        cache: "no-store",
      });
    },

    /**
     * @param {ApiQuery} query
     */
    getPerformanceBreakdown(query) {
      return jsonRequest(ENDPOINTS.performanceBreakdown, {
        query,
        credentials: "include",
        cache: "no-store",
      });
    },

    /**
     * @param {ApiQuery} query
     */
    getPerformancePicks(query) {
      return jsonRequest(ENDPOINTS.performancePicks, {
        query,
        credentials: "include",
        cache: "no-store",
      });
    },

    /**
     * @param {ApiQuery} query
     */
    getPerformanceBookComparison(query) {
      return jsonRequest(ENDPOINTS.performanceBookComparison, {
        query,
        credentials: "include",
        cache: "no-store",
      });
    },
  });

  window.BoardWiseApi = /** @type {BoardWiseApiClient} */ (client);
})();
