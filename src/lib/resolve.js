export function headFirstName(head) {
  const rest = String(head || "")
    .replace(/^(Ms|Mr|Mrs|Dr)\.?\s+/i, "")
    .trim();
  return rest.split(/\s+/)[0] || rest;
}

function list(centreList, defaultList, useDefaults) {
  if (useDefaults || !centreList?.length) return defaultList || [];
  return centreList;
}

export function resolveCentre(centre, defaults) {
  const headName = (centre.head || "").trim();
  const notes = (centre.headNotes || []).map((note) => note.trim()).filter(Boolean);
  const head = headName
    ? {
        name: headName,
        role: (centre.headRole || "").trim() || "Centre Head",
        since: (centre.headSince || "").trim() || "—",
        quote: (centre.headQuote || "").trim() || "—",
        notes: notes.length ? notes : ["—"],
        firstName: headFirstName(headName),
      }
    : null;

  const alt = (centre.heroImageAlt || "").trim() || `Children at Little Elly ${centre.area}`;

  return {
    slug: centre.slug,
    name: centre.name,
    area: centre.area,
    city: centre.city,
    state: centre.state,
    address: centre.address,
    phone: centre.phone || "",
    email: centre.email || "",
    mapUrl: centre.mapUrl || "",
    sortOrder: centre.sortOrder ?? 0,
    head,
    hero: {
      url: centre.heroImage?.url || "",
      alt,
    },
    strengths: list(centre.strengths, defaults.strengths, centre.useNetworkDefaults).slice(0, 3),
    facilities: list(centre.facilities, defaults.facilities, centre.useNetworkDefaults).slice(0, 6),
    programs: list(centre.programs, defaults.programs, centre.useNetworkDefaults),
    hours: list(centre.hours, defaults.hours, centre.useNetworkDefaults),
    useNetworkDefaults: Boolean(centre.useNetworkDefaults),
  };
}
