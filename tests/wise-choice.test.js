import { afterEach, describe, expect, it, vi } from "vitest";

function candidate(overrides = {}) {
  return {
    selection_text: "Home moneyline",
    sportsbook: "BookA",
    odds_text: "-120",
    wise_choice_score: 8,
    expected_value_per_unit: 0.04,
    kelly_fraction: 0.02,
    model_probability: 0.56,
    ...overrides,
  };
}

async function loadHelper() {
  vi.resetModules();
  delete window.BoardWiseWiseChoice;
  await import("../assets/js/wise-choice.js");
  return window.BoardWiseWiseChoice;
}

afterEach(() => {
  delete window.BoardWiseWiseChoice;
});

describe("wise-choice shared helper", () => {
  it("keeps explicit Wise Choice ahead of recommendation fallbacks", async () => {
    const helper = await loadHelper();
    const explicit = candidate({ selection_text: "Explicit Wise Choice", wise_choice_score: 1 });
    const official = candidate({ selection_text: "Official fallback", wise_choice_score: 40, is_official: true });

    const selected = helper.selectWiseChoiceForGame({
      game_label: "Away at Home",
      best_card_options: { wise_choice: explicit },
      recommendations: [official],
    });

    expect(selected.selection_text).toBe("Explicit Wise Choice");
  });

  it("falls back to the highest-ranked official game recommendation", async () => {
    const helper = await loadHelper();
    const selected = helper.selectWiseChoiceForGame({
      game_label: "Away at Home",
      best_card_options: {},
      recommendations: [
        candidate({ selection_text: "Lower official", wise_choice_score: 5, is_official: true }),
        candidate({ selection_text: "Higher official", wise_choice_score: 11, is_official: true }),
        candidate({ selection_text: "Higher public", wise_choice_score: 30, is_official: false }),
      ],
    });

    expect(selected.selection_text).toBe("Higher official");
  });

  it("falls back to public game recommendations when no official recommendation exists", async () => {
    const helper = await loadHelper();
    const selected = helper.selectWiseChoiceForGame({
      game_label: "Away at Home",
      recommendations: [
        candidate({ selection_text: "Lower public", wise_choice_score: 2 }),
        candidate({ selection_text: "Higher public", wise_choice_score: 7 }),
      ],
    });

    expect(selected.selection_text).toBe("Higher public");
  });

  it("uses matching top-level official recommendations only when tied by game label", async () => {
    const helper = await loadHelper();
    const selected = helper.selectWiseChoiceForGame(
      { game_label: "Away at Home", recommendations: [] },
      {
        official_recommendations: [
          candidate({ selection_text: "Other game", game_label: "Elsewhere at Team", is_official: true }),
          candidate({ selection_text: "Matched top-level", game_label: "Away at Home", is_official: true }),
        ],
      }
    );

    expect(selected.selection_text).toBe("Matched top-level");
  });

  it("keeps explicit best-card precedence before top-level official fallbacks in bet lists", async () => {
    const helper = await loadHelper();
    const explicit = candidate({ selection_text: "Explicit card", wise_choice_score: 1 });
    const items = helper.collectRecommendedBets(
      [{ game_label: "Away at Home", best_card_options: { wise_choice: explicit }, recommendations: [] }],
      {
        official_recommendations: [
          candidate({ selection_text: "Matched top-level", game_label: "Away at Home", is_official: true, wise_choice_score: 99 }),
        ],
      },
      { mode: "wise_choice" }
    );

    expect(items).toHaveLength(1);
    expect(items[0].option.selection_text).toBe("Explicit card");
  });

  it("returns null for empty recommendation and best-card containers", async () => {
    const helper = await loadHelper();

    expect(helper.selectWiseChoiceForGame({ game_label: "Away at Home", recommendations: null })).toBeNull();
    expect(helper.collectRecommendedBets(null)).toEqual([]);
  });

  it("skips candidates missing a selection or odds/price display", async () => {
    const helper = await loadHelper();
    const selected = helper.selectWiseChoiceForGame({
      game_label: "Away at Home",
      recommendations: [
        { selection_text: "No odds", sportsbook: "BookA" },
        { odds_text: "-105", sportsbook: "BookA" },
        candidate({ selection_text: "Valid public" }),
      ],
    });

    expect(helper.isPublicCandidate({ selection_text: "No odds" })).toBe(false);
    expect(helper.isPublicCandidate({ odds_text: "-105" })).toBe(false);
    expect(selected.selection_text).toBe("Valid public");
  });

  it("preserves valid falsey numeric values", async () => {
    const helper = await loadHelper();
    const selected = helper.selectWiseChoiceForGame({
      game_label: "Away at Home",
      recommendations: [
        candidate({
          wise_choice_score: 0,
          expected_value_per_unit: 0,
          kelly_fraction: 0,
          model_probability: 0,
          confidence_rank: 0,
        }),
      ],
    });

    expect(selected.wise_choice_score).toBe(0);
    expect(selected.expected_value_per_unit).toBe(0);
    expect(selected.kelly_fraction).toBe(0);
    expect(selected.model_probability).toBe(0);
    expect(selected.confidence_rank).toBe(0);
  });

  it("skips tracking-only candidates only when the sport adapter requests it", async () => {
    const helper = await loadHelper();
    const trackingOnly = candidate({ selection_text: "YRFI", tracking_only: true });

    expect(helper.isPublicCandidate(trackingOnly)).toBe(true);
    expect(helper.isPublicCandidate(trackingOnly, { excludeTrackingOnly: true })).toBe(false);
  });

  it("does not mutate payload objects and returns only public display fields", async () => {
    const helper = await loadHelper();
    const original = candidate({
      selection_text: "Clean display",
      provider_payload: { raw: true },
      debug_notes: "hidden",
      internal_model_id: "secret-model",
      token: "not-public",
    });
    const game = {
      game_label: "Away at Home",
      recommendations: [original],
    };
    const before = JSON.stringify(game);

    const selected = helper.selectWiseChoiceForGame(game);

    expect(JSON.stringify(game)).toBe(before);
    expect(selected).not.toBe(original);
    expect(selected.selection_text).toBe("Clean display");
    expect(selected.provider_payload).toBeUndefined();
    expect(selected.debug_notes).toBeUndefined();
    expect(selected.internal_model_id).toBeUndefined();
    expect(selected.token).toBeUndefined();
  });
});
