(function () {
  function access(payload) {
    return payload && payload.access && typeof payload.access === "object"
      ? payload.access
      : {};
  }

  function accessLevel(payload) {
    const value = access(payload);
    return String(value.level || (value.preview ? "preview" : "full"));
  }

  function hasFullCardAccess(payload) {
    const value = access(payload);
    return accessLevel(payload) === "full" || String(value.card_access || "") === "full";
  }

  function isLimitedBoard(payload) {
    return accessLevel(payload) === "preview";
  }

  window.BoardWiseMlbAccess = Object.freeze({
    accessLevel,
    hasFullCardAccess,
    isLimitedBoard,
  });
})();
