export function presentCentre(doc, { summary = false } = {}) {
  const centre = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const base = {
    id: String(centre._id),
    slug: centre.slug,
    name: centre.name,
    area: centre.area,
    city: centre.city,
    state: centre.state,
    phone: centre.phone || "",
    status: centre.status,
    sortOrder: centre.sortOrder ?? 0,
    updatedAt: centre.updatedAt,
  };
  if (summary) return base;
  return {
    ...base,
    address: centre.address || "",
    email: centre.email || "",
    mapUrl: centre.mapUrl || "",
    head: centre.head || "",
    headRole: centre.headRole || "",
    headSince: centre.headSince || "",
    headQuote: centre.headQuote || "",
    headNotes: centre.headNotes || [],
    heroImage: centre.heroImage || null,
    heroImageAlt: centre.heroImageAlt || "",
    strengths: centre.strengths || [],
    programs: centre.programs || [],
    facilities: centre.facilities || [],
    hours: centre.hours || [],
    useNetworkDefaults: centre.useNetworkDefaults !== false,
  };
}

export function presentFinder(doc) {
  const finder = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    seo: finder.seo,
    hero: finder.hero,
    search: finder.search,
    location: finder.location,
    card: finder.card,
    aliases: finder.aliases || [],
    cities: finder.cities || [],
    updatedAt: finder.updatedAt,
  };
}

export function presentDefaults(doc) {
  const defaults = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    page: defaults.page,
    strengths: defaults.strengths || [],
    facilities: defaults.facilities || [],
    programs: defaults.programs || [],
    hours: defaults.hours || [],
    day: defaults.day || [],
    updatedAt: defaults.updatedAt,
  };
}

export function presentAdmin(user) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
