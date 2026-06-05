(function installWiseChoiceHelper(global) {
  const PUBLIC_CANDIDATE_FIELDS = [
    "selection_text",
    "label",
    "sportsbook",
    "odds_text",
    "price_american",
    "price_decimal",
    "model_probability",
    "model_probability_text",
    "model_prob_text",
    "market_probability_text",
    "market_no_vig_prob",
    "market_implied_prob",
    "implied_probability",
    "price_implied_probability",
    "edge_text",
    "expected_value_per_unit",
    "ev_text",
    "kelly_fraction",
    "kelly_text",
    "wise_choice_score",
    "wise_choice_text",
    "wise_choice_bucket_key",
    "wise_choice_bucket_label",
    "wise_choice_status",
    "wise_choice_rank",
    "wise_choice_color",
    "ev_rating",
    "ev_rating_color",
    "prob_rating",
    "prob_rating_color",
    "is_official",
    "is_primary",
    "status_label",
    "stake_text",
    "confidence_rank",
    "game_label"
  ];

  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function isTrackingOnly(candidate) {
    return Boolean(candidate && (candidate.tracking_only || candidate.is_tracking_only));
  }

  function formatAmericanOdds(value) {
    const number = finiteNumber(value);
    if (number === null) return "";
    return number > 0 ? `+${number}` : String(number);
  }

  function priceDisplay(candidate) {
    const oddsText = text(candidate.odds_text);
    if (oddsText && oddsText.toUpperCase() !== "N/A") return oddsText;
    const american = formatAmericanOdds(candidate.price_american);
    if (american) return american;
    const decimal = finiteNumber(candidate.price_decimal);
    return decimal === null ? "" : String(decimal);
  }

  function selectionDisplay(candidate) {
    return text(candidate.selection_text) || text(candidate.label);
  }

  function gameLabelFor(game, options = {}) {
    if (typeof options.gameLabelForGame === "function") {
      return text(options.gameLabelForGame(game));
    }
    return text(game?.game_label) || `${text(game?.away_team) || "Away"} at ${text(game?.home_team) || "Home"}`;
  }

  function normalizeGameLabel(value) {
    return text(value).replace(/\s+/g, " ").toLowerCase();
  }

  function normalizeCandidate(candidate, options = {}) {
    if (!isObject(candidate)) return null;
    if (options.excludeTrackingOnly && isTrackingOnly(candidate)) return null;

    const selection = selectionDisplay(candidate);
    const odds = priceDisplay(candidate);
    if (!selection || !odds) return null;

    const normalized = {};
    for (const field of PUBLIC_CANDIDATE_FIELDS) {
      if (candidate[field] !== undefined && candidate[field] !== null) {
        normalized[field] = candidate[field];
      }
    }
    normalized.selection_text = selection;
    if (!normalized.label && text(candidate.label)) normalized.label = text(candidate.label);
    normalized.odds_text = odds;
    return normalized;
  }

  function rankedCandidates(candidates, options = {}) {
    return candidates
      .map((candidate, index) => ({ candidate: normalizeCandidate(candidate, options), index }))
      .filter((entry) => entry.candidate)
      .sort((left, right) => {
        const leftKeys = sortKeys(left.candidate);
        const rightKeys = sortKeys(right.candidate);
        for (let index = 0; index < Math.max(leftKeys.length, rightKeys.length); index += 1) {
          const diff = (rightKeys[index] ?? -999) - (leftKeys[index] ?? -999);
          if (diff !== 0) return diff;
        }
        return left.index - right.index;
      })
      .map((entry) => entry.candidate);
  }

  function sortKeys(candidate) {
    return [
      finiteNumber(candidate?.wise_choice_score),
      finiteNumber(candidate?.kelly_fraction),
      finiteNumber(candidate?.expected_value_per_unit),
      finiteNumber(candidate?.model_probability),
      finiteNumber(candidate?.confidence_rank)
    ].map((value) => value ?? -999);
  }

  function bestCardOptions(game) {
    return isObject(game?.best_card_options) ? game.best_card_options : {};
  }

  function recommendationsFor(game) {
    return Array.isArray(game?.recommendations) ? game.recommendations : [];
  }

  function matchingTopLevelOfficials(game, boardPayload, options = {}) {
    const expectedLabel = normalizeGameLabel(gameLabelFor(game, options));
    if (!expectedLabel || !Array.isArray(boardPayload?.official_recommendations)) return [];
    return boardPayload.official_recommendations.filter((candidate) => (
      isObject(candidate)
      && candidate.is_official !== false
      && normalizeGameLabel(candidate.game_label) === expectedLabel
    ));
  }

  function firstValid(candidates, options = {}) {
    for (const candidate of candidates) {
      const normalized = normalizeCandidate(candidate, options);
      if (normalized) return normalized;
    }
    return null;
  }

  function firstRanked(candidates, options = {}) {
    return rankedCandidates(candidates, options)[0] || null;
  }

  function bestCardFallbackForMode(game, boardPayload, options = {}) {
    const cards = bestCardOptions(game);
    const mode = options.mode || "wise_choice";
    const orders = {
      wise_choice: ["wise_choice", "best_value", "highest_ev"],
      best_value: ["best_value", "highest_ev"],
      best_growth: ["best_growth", "wise_choice", "best_value", "highest_ev"]
    };
    const order = orders[mode] || [mode, "best_value", "highest_ev"];
    return firstValid(order.map((key) => cards[key]), options)
      || selectWiseChoiceForGame(game, boardPayload, options);
  }

  function selectWiseChoiceForGame(game, boardPayload = {}, options = {}) {
    const cards = bestCardOptions(game);
    const bestCard = firstValid([cards.wise_choice, cards.best_value, cards.highest_ev], options);
    if (bestCard) return bestCard;

    const recs = recommendationsFor(game);
    const official = firstRanked(recs.filter((candidate) => candidate?.is_official), options);
    if (official) return official;

    const publicRec = firstRanked(recs, options);
    if (publicRec) return publicRec;

    return firstRanked(matchingTopLevelOfficials(game, boardPayload, options), options);
  }

  function collectRecommendedBets(games, boardPayload = {}, options = {}) {
    const bets = [];
    for (const game of Array.isArray(games) ? games : []) {
      const recs = rankedCandidates(recommendationsFor(game), options);
      const official = recs.filter((candidate) => candidate.is_official);
      let source = official.length ? official : recs;
      if (!source.length) {
        const fallback = bestCardFallbackForMode(game, boardPayload, options);
        if (fallback) source = [fallback];
      }
      const gameLabel = gameLabelFor(game, options);
      for (const option of source) {
        bets.push({ game, option, gameLabel });
      }
    }
    return bets.sort((left, right) => {
      const leftKeys = sortKeys(left.option);
      const rightKeys = sortKeys(right.option);
      for (let index = 0; index < Math.max(leftKeys.length, rightKeys.length); index += 1) {
        const diff = (rightKeys[index] ?? -999) - (leftKeys[index] ?? -999);
        if (diff !== 0) return diff;
      }
      return String(left.gameLabel).localeCompare(String(right.gameLabel));
    });
  }

  global.BoardWiseWiseChoice = Object.freeze({
    isPublicCandidate(candidate, options = {}) {
      return Boolean(normalizeCandidate(candidate, options));
    },
    selectWiseChoiceForGame,
    collectRecommendedBets
  });
})(window);
