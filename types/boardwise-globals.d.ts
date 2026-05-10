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

interface Window {
  BOARDWISE_API_BASE?: string;
  BoardWiseAuth?: BoardWiseAuthApi;
  BoardWiseGates?: BoardWiseGatesApi;
}
