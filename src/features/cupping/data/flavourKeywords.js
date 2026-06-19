const FLAVOUR_KEYWORDS = [
  { keyword: "floral", colour: "#E61E8A", level: 1, parent: "" },
  { keyword: "fruity", colour: "#E51C2D", level: 1, parent: "" },
  { keyword: "green vegetative", colour: "#1FA64A", level: 1, parent: "" },
  { keyword: "nutty cocoa", colour: "#7B5A52", level: 1, parent: "" },
  { keyword: "other", colour: "#1E9BC1", level: 1, parent: "" },
  { keyword: "roasted", colour: "#C24A2C", level: 1, parent: "" },
  { keyword: "sour fermented", colour: "#D9D42E", level: 1, parent: "" },
  { keyword: "spices", colour: "#B11F3A", level: 1, parent: "" },
  { keyword: "sweet", colour: "#E46C2C", level: 1, parent: "" },
  { keyword: "brown sugar", colour: "#C77C8A", level: 2, parent: "sweet" },
  { keyword: "overall sweet", colour: "#E98B78", level: 2, parent: "sweet" },
  { keyword: "sweet aromatics", colour: "#D98C9C", level: 2, parent: "sweet" },
  { keyword: "vanilla", colour: "#E6B8A2", level: 2, parent: "sweet" },
  { keyword: "vanillin", colour: "#E7B59A", level: 2, parent: "sweet" },
  { keyword: "caramelized", colour: "#D89B2B", level: 3, parent: "brown sugar" },
  { keyword: "honey", colour: "#F28C28", level: 3, parent: "brown sugar" },
  { keyword: "maple syrup", colour: "#B96A3C", level: 3, parent: "brown sugar" },
  { keyword: "molasses", colour: "#4A2A2A", level: 3, parent: "brown sugar" },
  { keyword: "black tea", colour: "#4A2A2A", level: 2, parent: "floral" },
  { keyword: "chamomile", colour: "#F0B23D", level: 2, parent: "floral" },
  { keyword: "jasmine", colour: "#F4F0E8", level: 2, parent: "floral" },
  { keyword: "rose", colour: "#D96A9E", level: 2, parent: "floral" },
  { keyword: "blackberry", colour: "#111111", level: 3, parent: "berry" },
  { keyword: "blueberry", colour: "#5B5EA6", level: 3, parent: "berry" },
  { keyword: "raspberry", colour: "#FF1493", level: 3, parent: "berry" },
  { keyword: "strawberry", colour: "#E63946", level: 3, parent: "berry" },
  { keyword: "coconut", colour: "#D9903D", level: 3, parent: "dried fruit" },
  { keyword: "prune", colour: "#6F42C1", level: 3, parent: "dried fruit" },
  { keyword: "raisin", colour: "#7D3C98", level: 3, parent: "dried fruit" },
  { keyword: "apple", colour: "#66BB6A", level: 3, parent: "other fruit" },
  { keyword: "cherry", colour: "#D7263D", level: 3, parent: "other fruit" },
  { keyword: "grape", colour: "#8BC34A", level: 3, parent: "other fruit" },
  { keyword: "peach", colour: "#F4A261", level: 3, parent: "other fruit" },
  { keyword: "pear", colour: "#C0CA33", level: 3, parent: "other fruit" },
  { keyword: "pineapple", colour: "#F4A261", level: 3, parent: "other fruit" },
  { keyword: "pomegranate", colour: "#E63946", level: 3, parent: "other fruit" },
  { keyword: "grapefruit", colour: "#F06292", level: 3, parent: "citrus fruit" },
  { keyword: "lemon", colour: "#FFEB3B", level: 3, parent: "citrus fruit" },
  { keyword: "lime", colour: "#8BC34A", level: 3, parent: "citrus fruit" },
  { keyword: "orange", colour: "#F57C00", level: 3, parent: "citrus fruit" },
  { keyword: "alcohol fermented", colour: "#A79B36", level: 2, parent: "sour fermented" },
  { keyword: "sour", colour: "#D7D530", level: 2, parent: "sour fermented" },
  { keyword: "acetic acid", colour: "#AED581", level: 3, parent: "sour" },
  { keyword: "butyric acid", colour: "#C0CA33", level: 3, parent: "sour" },
  { keyword: "citric acid", colour: "#D4E157", level: 3, parent: "sour" },
  { keyword: "isovaleric acid", colour: "#66BB6A", level: 3, parent: "sour" },
  { keyword: "malic acid", colour: "#AED581", level: 3, parent: "sour" },
  { keyword: "sour aromatics", colour: "#B5B83B", level: 3, parent: "sour" },
  { keyword: "fermented", colour: "#D4AF37", level: 3, parent: "alcohol fermented" },
  { keyword: "overripe", colour: "#8A7B2F", level: 3, parent: "alcohol fermented" },
  { keyword: "whiskey", colour: "#8D6E63", level: 3, parent: "alcohol fermented" },
  { keyword: "winey", colour: "#AD1457", level: 3, parent: "alcohol fermented" },
  { keyword: "beany", colour: "#7AAE8E", level: 2, parent: "green vegetative" },
  { keyword: "dark green", colour: "#006B3C", level: 2, parent: "green vegetative" },
  { keyword: "fresh", colour: "#00A86B", level: 2, parent: "green vegetative" },
  { keyword: "hay-like", colour: "#A3C644", level: 2, parent: "green vegetative" },
  { keyword: "herb-like", colour: "#7DBE3C", level: 2, parent: "green vegetative" },
  { keyword: "olive oil", colour: "#8E8A3A", level: 2, parent: "green vegetative" },
  { keyword: "peapod", colour: "#57C84D", level: 2, parent: "green vegetative" },
  { keyword: "raw", colour: "#7E8A3A", level: 2, parent: "green vegetative" },
  { keyword: "under-ripe", colour: "#B6D94A", level: 2, parent: "green vegetative" },
  { keyword: "vegetative", colour: "#2F9E44", level: 2, parent: "green vegetative" },
  { keyword: "chemical", colour: "#5BC0DE", level: 2, parent: "other" },
  { keyword: "papery musty", colour: "#A8BCC7", level: 2, parent: "other" },
  { keyword: "animalic", colour: "#A6A57A", level: 3, parent: "papery musty" },
  { keyword: "cardboard", colour: "#D4B72A", level: 3, parent: "papery musty" },
  { keyword: "meaty brothy", colour: "#D98C8C", level: 3, parent: "papery musty" },
  { keyword: "moldy damp", colour: "#8A9A5B", level: 3, parent: "papery musty" },
  { keyword: "musty dusty", colour: "#B5A36A", level: 3, parent: "papery musty" },
  { keyword: "musty earthy", colour: "#9C8B5A", level: 3, parent: "papery musty" },
  { keyword: "papery", colour: "#F2F2F2", level: 3, parent: "papery musty" },
  { keyword: "phenolic", colour: "#E67E8C", level: 3, parent: "papery musty" },
  { keyword: "stale", colour: "#6B7F6A", level: 3, parent: "papery musty" },
  { keyword: "woody", colour: "#8B6B3F", level: 3, parent: "papery musty" },
  { keyword: "bitter", colour: "#66C2CC", level: 3, parent: "chemical" },
  { keyword: "medicinal", colour: "#8ED1E8", level: 3, parent: "chemical" },
  { keyword: "petroleum", colour: "#00AEEF", level: 3, parent: "chemical" },
  { keyword: "rubber", colour: "#0B132B", level: 3, parent: "chemical" },
  { keyword: "salty", colour: "#D9E6E6", level: 3, parent: "chemical" },
  { keyword: "skunky", colour: "#6C7A89", level: 3, parent: "chemical" },
  { keyword: "burnt", colour: "#A9794A", level: 2, parent: "roasted" },
  { keyword: "cereal", colour: "#E3C13B", level: 2, parent: "roasted" },
  { keyword: "pipe tobacco", colour: "#8B6F47", level: 2, parent: "roasted" },
  { keyword: "tobacco", colour: "#B09B63", level: 2, parent: "roasted" },
  { keyword: "grain", colour: "#D9B38C", level: 3, parent: "cereal" },
  { keyword: "malt", colour: "#F0A060", level: 3, parent: "cereal" },
  { keyword: "acrid", colour: "#9A8F5A", level: 3, parent: "burnt" },
  { keyword: "ashy", colour: "#A8B0A0", level: 3, parent: "burnt" },
  { keyword: "brown roast", colour: "#7B5A2E", level: 3, parent: "burnt" },
  { keyword: "smoky", colour: "#8C8A6B", level: 3, parent: "burnt" },
  { keyword: "brown spice", colour: "#B23A48", level: 2, parent: "spices" },
  { keyword: "pepper", colour: "#D7263D", level: 2, parent: "spices" },
  { keyword: "pungent", colour: "#6B5B6B", level: 2, parent: "spices" },
  { keyword: "anise", colour: "#D4AF37", level: 3, parent: "brown spice" },
  { keyword: "cinnamon", colour: "#E67E22", level: 3, parent: "brown spice" },
  { keyword: "clove", colour: "#C97F6B", level: 3, parent: "brown spice" },
  { keyword: "nutmeg", colour: "#C0392B", level: 3, parent: "brown spice" },
  { keyword: "cocoa", colour: "#A66A2C", level: 2, parent: "nutty cocoa" },
  { keyword: "nutty", colour: "#B89B8A", level: 2, parent: "nutty cocoa" },
  { keyword: "almond", colour: "#D9B8A6", level: 3, parent: "nutty" },
  { keyword: "hazelnut", colour: "#A67C3B", level: 3, parent: "nutty" },
  { keyword: "peanuts", colour: "#E3C13B", level: 3, parent: "nutty" },
  { keyword: "chocolate", colour: "#6B3E2E", level: 3, parent: "cocoa" },
  { keyword: "dark chocolate", colour: "#4A2C2A", level: 3, parent: "cocoa" },
  { keyword: "berry", colour: "#D91F5C", level: 2, parent: "fruity" },
  { keyword: "citrus fruit", colour: "#F0B52A", level: 2, parent: "fruity" },
  { keyword: "dried fruit", colour: "#D94B73", level: 2, parent: "fruity" },
  { keyword: "other fruit", colour: "#E56A4A", level: 2, parent: "fruity" },
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordToRegex(keyword) {
  const escaped = escapeRegex(keyword.trim()).replace(/\\ /g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])(${escaped})(?=$|[^a-z0-9])`, "i");
}

function findKeywordMatch(source, keyword) {
  const match = keywordToRegex(keyword).exec(source);
  if (!match) {
    return null;
  }

  const start = match.index + match[1].length;
  const text = match[2] || keyword;
  return {
    start,
    end: start + text.length,
  };
}

function findKeywordMatches(source, keyword) {
  const matches = [];
  let cursor = 0;

  while (cursor < source.length) {
    const match = findKeywordMatch(source.slice(cursor), keyword);
    if (!match) {
      break;
    }

    const start = cursor + match.start;
    const end = cursor + match.end;
    matches.push({ start, end });
    cursor = Math.max(end, cursor + 1);
  }

  return matches;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function findFlavourKeywordPills(text) {
  const source = String(text || "");
  if (!source.trim()) {
    return [];
  }

  const seen = new Set();
  const matches = FLAVOUR_KEYWORDS
    .map((item, index) => ({
      item,
      index,
      match: findKeywordMatch(source, item.keyword),
    }))
    .filter((entry) => entry.match)
    .sort((a, b) => {
      const lengthDiff = b.item.keyword.length - a.item.keyword.length;
      return lengthDiff || a.index - b.index;
    })
    .reduce((acc, entry) => {
      if (acc.some((existing) => rangesOverlap(existing.match, entry.match))) {
        return acc;
      }
      acc.push(entry);
      return acc;
    }, [])
    .sort((a, b) => a.match.start - b.match.start || a.index - b.index);

  return matches.reduce((acc, { item }) => {
    const key = item.keyword.toLowerCase();
    if (seen.has(key)) {
      return acc;
    }

    seen.add(key);
    acc.push({
      keyword: item.keyword,
      label: item.keyword,
      colour: item.colour,
    });
    return acc;
  }, []);
}

export function tokenizeFlavourKeywords(text) {
  const source = String(text || "");
  if (!source) {
    return [];
  }

  const matches = FLAVOUR_KEYWORDS
    .flatMap((item, index) =>
      findKeywordMatches(source, item.keyword).map((match) => ({
        item,
        index,
        match,
      }))
    )
    .sort((a, b) => {
      const lengthDiff = b.item.keyword.length - a.item.keyword.length;
      return lengthDiff || a.index - b.index;
    })
    .reduce((acc, entry) => {
      if (acc.some((existing) => rangesOverlap(existing.match, entry.match))) {
        return acc;
      }
      acc.push(entry);
      return acc;
    }, [])
    .sort((a, b) => a.match.start - b.match.start || a.index - b.index);

  if (matches.length === 0) {
    return [{ type: "text", text: source }];
  }

  const tokens = [];
  let cursor = 0;
  matches.forEach(({ item, match }) => {
    if (match.start > cursor) {
      tokens.push({ type: "text", text: source.slice(cursor, match.start) });
    }
    tokens.push({
      type: "pill",
      text: source.slice(match.start, match.end),
      keyword: item.keyword,
      colour: item.colour,
    });
    cursor = match.end;
  });

  if (cursor < source.length) {
    tokens.push({ type: "text", text: source.slice(cursor) });
  }

  return tokens.filter((token) => token.text);
}

export { FLAVOUR_KEYWORDS };
