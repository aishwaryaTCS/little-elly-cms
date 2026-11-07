/**
 * Live card previews (UI-4). Each one mirrors the website's card for that content:
 * same shape, colours and text order, so the admin sees what visitors will see.
 */
const accent = (name) => `var(--${name || "coral"})`;

function Photo({ image, ratio, className = "", contain = false }) {
  return (
    <div className={`pv-photo ${className}`} style={ratio ? { aspectRatio: ratio } : undefined}>
      {image?.url ? <img src={image.url} alt={image.alt || ""} style={{ objectFit: contain ? "contain" : "cover" }} /> : <span>Photo</span>}
    </div>
  );
}

export function PreviewFrame({ title = "Preview", note, children }) {
  return (
    <aside className="preview-frame" aria-label={title}>
      <p className="kicker">{title}</p>
      {children}
      {note ? <p className="help">{note}</p> : null}
    </aside>
  );
}

export function TeamPersonPreview({ doc }) {
  return (
    <PreviewFrame note="On the website the note shows when a visitor hovers the card.">
      <article className="pv-team">
        <Photo image={doc.photo} ratio="3 / 4" className="top-weighted" />
        <div className="pv-team-shade" />
        <div className="pv-team-text">
          <span className="pv-chip" style={{ background: "var(--coral)" }}>{doc.role || "Role"}</span>
          <h3>{doc.name || "Name"}</h3>
          {doc.note ? <p>{doc.note}</p> : null}
        </div>
      </article>
    </PreviewFrame>
  );
}

export function TeamGroupPreview({ doc }) {
  return (
    <PreviewFrame>
      <figure className="pv-team group">
        <Photo image={doc.photo} ratio="16 / 10" />
        <div className="pv-team-shade" />
        <figcaption className="pv-team-text">
          <h3>{doc.name || "Group name"}</h3>
          {doc.line ? <p>{doc.line}</p> : null}
        </figcaption>
      </figure>
    </PreviewFrame>
  );
}

export function AwardPreview({ doc }) {
  return (
    <PreviewFrame note="Award images are never cropped.">
      <div className="pv-award">
        <Photo image={doc.image} ratio="4 / 3" contain />
        <span className="pv-chip soft">Award 01</span>
        <h3>{doc.issuer || "Issuer"}</h3>
        <p>{doc.line || "One line about the award."}</p>
      </div>
    </PreviewFrame>
  );
}

export function ProgramPreview({ doc }) {
  const home = accent(doc.accent);
  const page = accent(doc.pageAccent || doc.accent);
  return (
    <PreviewFrame title="Preview" note="Top: home page carousel. Bottom: programs page.">
      <div className="pv-program-home">
        <div className="pv-circle-wrap" style={{ background: `color-mix(in oklab, ${home} 10%, white)`, borderColor: `color-mix(in oklab, ${home} 24%, transparent)` }}>
          <div className="pv-circle" style={{ background: home }}>
            {doc.cardPhoto?.url ? <img src={doc.cardPhoto.url} alt="" /> : null}
          </div>
        </div>
        <span className="pv-chip" style={{ background: home }}>{doc.ageLabel || "Age"}</span>
        <h3>{doc.name || "Program"}</h3>
        <p>{doc.line}</p>
        <ul>
          {(doc.learn || []).map((item, index) => (
            <li key={index}>
              <span style={{ background: `color-mix(in oklab, ${home} 20%, white)`, color: home }}>✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="pv-program-page">
        <div className="pv-frame" style={{ borderColor: `color-mix(in oklab, ${page} 26%, transparent)` }}>
          <Photo image={doc.photo} ratio="4 / 3" />
          <span className="pv-chip abs" style={{ background: page }}>
            {doc.ratio?.adults || 1} : {doc.ratio?.children || 1} · adult : child
          </span>
        </div>
        <span className="pv-chip" style={{ background: page }}>{doc.pageAgeLabel || doc.ageLabel || "Age"}</span>
        <h3>{doc.name || "Program"}</h3>
        <p className="lead">{doc.pageLine || doc.line}</p>
        <p>{doc.longDescription}</p>
        <div className="pv-skills">
          {(doc.skills || []).filter(Boolean).map((skill, index) => (
            <span key={index} style={{ borderColor: `color-mix(in oklab, ${page} 35%, transparent)` }}>
              {skill}
            </span>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}

export function VoicePreview({ doc }) {
  return (
    <PreviewFrame>
      <div className="pv-voice">
        <Photo image={doc.photo} ratio="16 / 10" className="framed" />
        <span className="pv-quote" aria-hidden="true">“</span>
        <p className="lead">{doc.lead}</p>
        <p className="highlight">{doc.highlight || "The line that stands out."}</p>
        <p>{doc.quote}</p>
        <p className="name">{doc.name || "Parent name"}</p>
        <p className="role">{doc.role}</p>
      </div>
    </PreviewFrame>
  );
}

export function NewsPreview({ doc }) {
  const tone = accent(doc.accent);
  return (
    <PreviewFrame>
      <article className="pv-news">
        <div className="pv-news-photo">
          <Photo image={doc.image} ratio="16 / 9" />
          <div className="pv-news-shade" style={{ background: `linear-gradient(to top, color-mix(in oklab, ${tone} 55%, transparent), transparent 62%)` }} />
          <span className="pv-chip abs" style={{ background: tone }}>{doc.tag || "Tag"}</span>
        </div>
        <div className="pv-news-text">
          <h3>{doc.title || "Title"}</h3>
          <p>{doc.line}</p>
        </div>
      </article>
    </PreviewFrame>
  );
}

export function BlogCardPreview({ doc, category }) {
  const tone = accent(category?.accent);
  return (
    <PreviewFrame note="Card on the blogs page.">
      <article className="pv-blog">
        <Photo image={doc.coverImage} ratio="16 / 9" contain />
        <div className="pv-news-text">
          <span className="pv-tag" style={{ background: `color-mix(in oklab, ${tone} 16%, white)`, color: tone }}>
            {category?.name || "Category"}
          </span>
          <h3>{doc.title || "Title"}</h3>
          <p>{doc.excerpt}</p>
        </div>
      </article>
    </PreviewFrame>
  );
}
