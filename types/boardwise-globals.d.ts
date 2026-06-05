interface BoardWiseAuthState {
  authenticated: boolean;
  user: null | {
    email?: string;
    display_name?: string;
  };
  plan: string;
  features: Record<string, boolean>;
}

interface BoardWiseAuthApi {
  loadAuthState(options?: { force?: boolean }): Promise<BoardWiseAuthState>;
  hasFeature(state: BoardWiseAuthState | null | undefined, featureKey: string): boolean;
  displayName(state: BoardWiseAuthState | null | undefined): string;
  guestState: BoardWiseAuthState;
}

interface BoardWiseGatesApi {
  applyFeatureGates(root?: Document | Element): Promise<BoardWiseAuthState | null>;
  gateCard(input: {
    title: string;
    body: string;
    ctaText?: string;
    ctaHref?: string;
  }): string;
}

interface TurnstileApi {
  reset(widgetId?: string): void;
}

type BoardWiseApiQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined;

type BoardWisePerformanceQuery =
  | string
  | URLSearchParams
  | Record<
      string,
      BoardWiseApiQueryValue | BoardWiseApiQueryValue[]
    >;

interface BoardWiseApiErrorLike extends Error {
  status: number;
  statusText: string;
  url: string;
  body?: unknown;
}

interface BoardWiseBoardPayload {
  [key: string]: any;
  games?: any[];
  visibility?: Record<string, any>;
}

interface BoardWisePerformanceFiltersPayload {
  [key: string]: any;
  sports?: string[];
  markets?: any[];
  bookmakers?: any[];
  confidence_buckets?: any[];
  model_probability_buckets?: any[];
  wise_choice_buckets?: any[];
  model_versions?: any[];
  model_families?: any[];
  prediction_modes?: any[];
  visibility?: Record<string, any>;
}

interface BoardWisePerformanceSummaryPayload {
  [key: string]: any;
  summary?: Record<string, any>;
  visibility?: Record<string, any>;
}

interface BoardWisePerformanceBreakdownPayload {
  [key: string]: any;
  groups?: any[];
  visibility?: Record<string, any>;
}

interface BoardWisePerformancePicksPayload {
  [key: string]: any;
  picks?: any[];
  visibility?: Record<string, any>;
}

interface BoardWisePerformanceBookComparisonPayload {
  [key: string]: any;
  rows?: any[];
  comparison_mode?: string;
  common_pick_count?: number;
  visibility?: Record<string, any>;
}

interface BoardWiseApiClient {
  ApiError: {
    new (
      message: string,
      details: {
        status: number;
        statusText: string;
        url: string;
        body?: unknown;
      }
    ): BoardWiseApiErrorLike;
  };
  endpoints: Readonly<Record<string, string>>;
  buildUrl(path: string, query?: BoardWisePerformanceQuery): string;
  serializeQuery(query?: BoardWisePerformanceQuery): string;
  getMe(): Promise<BoardWiseAuthState>;
  startMagicLink(input: {
    email: string;
    return_to?: string;
    turnstile_token?: string;
  }): Promise<Record<string, any>>;
  verifyMagicLink(token: string): Promise<Record<string, any> | null>;
  logout(): Promise<Record<string, any> | null>;
  getMlbBoard(
    targetDate?: string,
    options?: { model?: string }
  ): Promise<BoardWiseBoardPayload>;
  getNhlBoard(targetDate?: string): Promise<BoardWiseBoardPayload>;
  getPerformanceFilters(
    sport?: string,
    options?: { model_family?: string; performance_scope?: string }
  ): Promise<BoardWisePerformanceFiltersPayload>;
  getPerformanceSummary(
    query: BoardWisePerformanceQuery
  ): Promise<BoardWisePerformanceSummaryPayload>;
  getPerformanceBreakdown(
    query: BoardWisePerformanceQuery
  ): Promise<BoardWisePerformanceBreakdownPayload>;
  getPerformancePicks(
    query: BoardWisePerformanceQuery
  ): Promise<BoardWisePerformancePicksPayload>;
  getPerformanceBookComparison(
    query: BoardWisePerformanceQuery
  ): Promise<BoardWisePerformanceBookComparisonPayload>;
}

interface BoardWiseWiseChoiceCandidate {
  [key: string]: any;
  selection_text?: string;
  label?: string;
  sportsbook?: string;
  odds_text?: string;
  is_official?: boolean;
}

interface BoardWiseWiseChoiceBetItem {
  game: any;
  option: BoardWiseWiseChoiceCandidate;
  gameLabel: string;
}

interface BoardWiseWiseChoiceOptions {
  excludeTrackingOnly?: boolean;
  mode?: string;
  gameLabelForGame?: (game: any) => string;
}

interface BoardWiseWiseChoiceApi {
  isPublicCandidate(
    candidate: unknown,
    options?: BoardWiseWiseChoiceOptions
  ): boolean;
  selectWiseChoiceForGame(
    game: any,
    boardPayload?: BoardWiseBoardPayload,
    options?: BoardWiseWiseChoiceOptions
  ): BoardWiseWiseChoiceCandidate | null;
  collectRecommendedBets(
    games: any[],
    boardPayload?: BoardWiseBoardPayload,
    options?: BoardWiseWiseChoiceOptions
  ): BoardWiseWiseChoiceBetItem[];
}

interface Window {
  BOARDWISE_API_BASE?: string;
  BoardWiseApi?: BoardWiseApiClient;
  BoardWiseAuth?: BoardWiseAuthApi;
  BoardWiseGates?: BoardWiseGatesApi;
  BoardWiseWiseChoice?: BoardWiseWiseChoiceApi;
  turnstile?: TurnstileApi;
}
