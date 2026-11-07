/**
 * In-CMS blog preview (BL-7): the last saved post in the website's article
 * layout, behind the admin sign-in. Nothing is shared or published.
 */
import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { formatDate } from "../content/ui.jsx";

const SAFE_HREF = /^(https:\/\/|mailto:|tel:|\/(?!\/))/i;

/** Renders the server-cleaned inline HTML as React elements: strong, em, links, line breaks only. */
function Rich({ html }) {
  const doc = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html");
  const walk = (node, key) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const children = [...node.childNodes].map((child, index) => walk(child, `${key}.${index}`));
    const tag = node.tagName.toLowerCase();
    if (tag === "strong" || tag === "b") return <strong key={key}>{children}</strong>;
    if (tag === "em" || tag === "i") return <em key={key}>{children}</em>;
    if (tag === "br") return <br key={key} />;
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      if (!SAFE_HREF.test(href)) return <Fragment key={key}>{children}</Fragment>;
      const external = /^https:/i.test(href);
      return (
        <a key={key} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {children}
        </a>
      );
    }
    return <Fragment key={key}>{children}</Fragment>;
  };
  return <>{[...doc.body.childNodes].map((node, index) => walk(node, String(index)))}</>;
}

const tone = (category) => `var(--${category?.accent || "coral"})`;

function Block({ block, next }) {
  if (block.type === "h2" || block.type === "h3") {
    const Tag = block.type;
    return <Tag className={next?.type === "table" ? "small" : undefined}>{block.text}</Tag>;
  }
  if (block.type === "ul" || block.type === "ol") {
    const List = block.type;
    return (
      <List>
        {block.items.map((item, index) => (
          <li key={index}>
            <Rich html={item} />
          </li>
        ))}
      </List>
    );
  }
  if (block.type === "image") return <img src={block.src} alt={block.alt} width={block.width} height={block.height} />;
  if (block.type === "table") {
    return (
      <div className="sa-table">
        <table className={block.head.length > 3 ? "wide" : undefined}>
          <thead>
            <tr>
              {block.head.map((cell, index) => (
                <th key={index}>
                  <Rich html={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>
                    <Rich html={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <p>
      <Rich html={block.text} />
    </p>
  );
}

function Card({ post }) {
  return (
    <span className="sa-card">
      {post.coverImage ? <img src={post.coverImage.url} alt="" /> : <span className="sa-card-img" />}
      <span className="sa-card-text">
        <span className="sa-card-cat" style={{ color: tone(post.category) }}>
          {post.category?.name}
        </span>
        <span className="sa-card-title">{post.title}</span>
      </span>
    </span>
  );
}

export default function PostPreview() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Preview · Little Elly CMS";
    api(`/api/admin/blog-posts/${id}/preview`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  const back = (
    <Link className="btn small" to={`/blogs/posts/${id}`}>
      Back to editor
    </Link>
  );

  if (error) {
    return (
      <div className="preview-page">
        <div className="preview-bar">
          <span>Only you can see this.</span>
          {back}
        </div>
        <p className="sa-error">{error}</p>
      </div>
    );
  }
  if (!data) return <div className="splash">Little Elly</div>;

  const { post, related, trending, status } = data;
  return (
    <div className="preview-page">
      <div className="preview-bar" role="status">
        <span>
          Only you can see this. {status === "published" ? "This post is live." : "This post is a draft."}
        </span>
        {back}
      </div>
      <article className="site-article">
        <div className="sa-grid">
          <div className="sa-main">
            <span className="sa-back">← All blogs</span>
            <div className="sa-meta">
              <span className="sa-tag" style={{ background: `color-mix(in oklab, ${tone(post.category)} 16%, white)`, color: tone(post.category) }}>
                {post.category?.name || "No category"}
              </span>
              <span className="sa-date">{formatDate(post.publishedAt)}</span>
            </div>
            <h1>{post.title}</h1>
            {post.coverImage ? <img className="sa-cover" src={post.coverImage.url} alt={post.coverImage.alt || post.title} /> : null}
            <div className="sa-body">
              {post.blocks.map((block, index) => (
                <Block key={index} block={block} next={post.blocks[index + 1]} />
              ))}
            </div>
            {post.author ? <p className="sa-author">By {post.author}</p> : null}
          </div>
          <aside className="sa-aside">
            <h2>Trending blogs</h2>
            <div className="sa-trending">
              {trending.map((item) => (
                <span key={item.slug} className="sa-trend">
                  {item.coverImage ? <img src={item.coverImage.url} alt="" /> : <span className="sa-trend-img" />}
                  <span>
                    <span className="sa-trend-title">{item.title}</span>
                    <span className="sa-trend-text">{item.excerpt}</span>
                  </span>
                </span>
              ))}
            </div>
          </aside>
        </div>
        <div className="sa-similar">
          <h2>Similar blogs</h2>
          <div className="sa-row">
            {related.map((item) => (
              <Card key={item.slug} post={item} />
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}
