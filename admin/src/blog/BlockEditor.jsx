/**
 * Blog block editor (BL-3): paragraphs, headings, lists, images and tables.
 * Add, edit, reorder, duplicate and remove. Paragraphs and list items take bold,
 * italic and links; the server cleans everything else (§4.3).
 */
import { useId, useRef, useState } from "react";
import { ImageSlot } from "../content/imageSlot.jsx";
import { TextField } from "../content/ui.jsx";

const LABELS = { p: "Paragraph", h2: "Heading", h3: "Subheading", ul: "Bullet list", ol: "Numbered list", image: "Image", table: "Table" };

const NEW = {
  p: () => ({ type: "p", text: "" }),
  h2: () => ({ type: "h2", text: "" }),
  h3: () => ({ type: "h3", text: "" }),
  ul: () => ({ type: "ul", items: [""] }),
  ol: () => ({ type: "ol", items: [""] }),
  image: () => ({ type: "image", image: null }),
  table: () => ({ type: "table", head: ["", ""], rows: [["", ""]] }),
};

const SAFE_HREF = /^(https:\/\/[^\s"<>]+|mailto:[^\s@"<>]+@[^\s@"<>]+\.[^\s"<>]+|tel:\+?[0-9 ()-]{3,20}|\/(?!\/)[^\s"<>]*)$/i;

/** Textarea with Bold / Italic / Link that wrap the selected words in allowed tags. */
function RichText({ label, value, onChange, rows = 4, max, error }) {
  const ref = useRef(null);
  const [link, setLink] = useState(null);
  const urlId = useId();

  function wrap(open, close) {
    const area = ref.current;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const chosen = value.slice(start, end) || "text";
    onChange(value.slice(0, start) + open + chosen + close + value.slice(end));
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + open.length, start + open.length + chosen.length);
    });
  }

  function addLink(event) {
    event.preventDefault();
    const href = link.href.trim();
    if (!SAFE_HREF.test(href)) {
      setLink({ ...link, error: "Use https://…, mailto:, tel: or a site path like /admissions/." });
      return;
    }
    const area = ref.current;
    const [start, end] = link.range;
    const chosen = value.slice(start, end) || href;
    onChange(`${value.slice(0, start)}<a href="${href.replace(/"/g, "")}">${chosen}</a>${value.slice(end)}`);
    setLink(null);
    requestAnimationFrame(() => area.focus());
  }

  return (
    <div className="rich">
      <div className="rich-tools" role="toolbar" aria-label={`${label} formatting`}>
        <button type="button" className="btn small" onClick={() => wrap("<strong>", "</strong>")}>
          <b>B</b>
          <span className="visually-hidden">Bold</span>
        </button>
        <button type="button" className="btn small" onClick={() => wrap("<em>", "</em>")}>
          <i>I</i>
          <span className="visually-hidden">Italic</span>
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => setLink({ href: "https://", range: [ref.current.selectionStart, ref.current.selectionEnd], error: "" })}
        >
          Link
        </button>
      </div>
      <TextField label={label} area rows={rows} value={value} max={max} error={error} onChange={onChange} inputProps={{ ref }} />
      {link ? (
        <div className="link-form" role="group" aria-label="Add link">
          <label htmlFor={urlId}>Link address</label>
          <div className="inline single">
            <input
              id={urlId}
              value={link.href}
              onChange={(event) => setLink({ ...link, href: event.target.value, error: "" })}
              onKeyDown={(event) => event.key === "Enter" && addLink(event)}
              autoFocus
            />
            <button type="button" className="btn small primary" onClick={addLink}>
              Add link
            </button>
            <button type="button" className="btn small ghost" onClick={() => setLink(null)}>
              Cancel
            </button>
          </div>
          {link.error ? <em className="error-text">{link.error}</em> : null}
        </div>
      ) : null}
    </div>
  );
}

function ListBlock({ block, onChange, errors, path }) {
  const items = block.items || [];
  const setItem = (index, text) => onChange({ ...block, items: items.map((item, i) => (i === index ? text : item)) });
  return (
    <div className="stack tight">
      {items.map((item, index) => (
        <div key={index} className="list-item">
          <RichText label={`Item ${index + 1}`} rows={2} max={1000} value={item} error={errors[`${path}.items.${index}`]} onChange={(text) => setItem(index, text)} />
          <button type="button" className="btn small ghost" onClick={() => onChange({ ...block, items: items.filter((_, i) => i !== index) })} disabled={items.length === 1}>
            Remove item
          </button>
        </div>
      ))}
      {items.length < 30 ? (
        <button type="button" className="btn ghost" onClick={() => onChange({ ...block, items: [...items, ""] })}>
          Add item
        </button>
      ) : null}
      {errors[`${path}.items`] ? <em className="error-text">{errors[`${path}.items`]}</em> : null}
    </div>
  );
}

function TableBlock({ block, onChange, errors, path }) {
  const head = block.head || [];
  const rows = block.rows || [];
  const cols = head.length;
  const setHead = (c, text) => onChange({ ...block, head: head.map((cell, i) => (i === c ? text : cell)) });
  const setCell = (r, c, text) => onChange({ ...block, rows: rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? text : cell)) : row)) });
  const addCol = () => onChange({ ...block, head: [...head, ""], rows: rows.map((row) => [...row, ""]) });
  const removeCol = () => onChange({ ...block, head: head.slice(0, -1), rows: rows.map((row) => row.slice(0, -1)) });
  return (
    <div className="stack tight">
      <div className="table-wrap">
        <table className="table-edit">
          <thead>
            <tr>
              {head.map((cell, c) => (
                <th key={c}>
                  <input aria-label={`Column ${c + 1} heading`} value={cell} maxLength={1200} onChange={(e) => setHead(c, e.target.value)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>
                    <input aria-label={`Row ${r + 1}, column ${c + 1}`} value={cell} maxLength={1200} onChange={(e) => setCell(r, c, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row-actions">
        <button type="button" className="btn small" onClick={() => onChange({ ...block, rows: [...rows, Array(cols).fill("")] })} disabled={rows.length >= 40}>
          Add row
        </button>
        <button type="button" className="btn small" onClick={() => onChange({ ...block, rows: rows.slice(0, -1) })} disabled={rows.length <= 1}>
          Remove last row
        </button>
        <button type="button" className="btn small" onClick={addCol} disabled={cols >= 6}>
          Add column
        </button>
        <button type="button" className="btn small" onClick={removeCol} disabled={cols <= 2}>
          Remove last column
        </button>
      </div>
      <small className="help">2–6 columns, up to 40 rows. Cells may use &lt;strong&gt;, &lt;em&gt; and links.</small>
      {errors[`${path}.rows`] || errors[`${path}.head`] ? <em className="error-text">{errors[`${path}.rows`] || errors[`${path}.head`]}</em> : null}
    </div>
  );
}

export default function BlockEditor({ blocks, onChange, errors }) {
  const update = (index, block) => onChange(blocks.map((item, i) => (i === index ? block : item)));
  const move = (index, direction) => {
    const next = blocks.slice();
    const [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item);
    onChange(next);
  };
  const insert = (type, at = blocks.length) => {
    const next = blocks.slice();
    next.splice(at, 0, NEW[type]());
    onChange(next);
  };

  return (
    <div className="blocks">
      {blocks.length === 0 ? <p className="empty">Add the first block below.</p> : null}
      {blocks.map((block, index) => {
        const path = `blocks.${index}`;
        const label = LABELS[block.type] || block.type;
        return (
          <section key={index} className="block" aria-label={`${label} ${index + 1}`}>
            <header className="block-head">
              <span className="pill">{label}</span>
              <span className="row-actions">
                <button type="button" className="btn small icon" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${label} ${index + 1} up`}>
                  ↑
                </button>
                <button type="button" className="btn small icon" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} aria-label={`Move ${label} ${index + 1} down`}>
                  ↓
                </button>
                <button type="button" className="btn small" onClick={() => onChange([...blocks.slice(0, index + 1), structuredClone(block), ...blocks.slice(index + 1)])}>
                  Duplicate
                </button>
                <button type="button" className="btn small ghost" onClick={() => onChange(blocks.filter((_, i) => i !== index))}>
                  Remove
                </button>
              </span>
            </header>
            {block.type === "p" ? <RichText label="Text" value={block.text || ""} max={3000} error={errors[`${path}.text`]} onChange={(text) => update(index, { ...block, text })} /> : null}
            {block.type === "h2" || block.type === "h3" ? (
              <TextField label={label} value={block.text} max={120} min={2} error={errors[`${path}.text`]} onChange={(text) => update(index, { ...block, text })} />
            ) : null}
            {block.type === "ul" || block.type === "ol" ? <ListBlock block={block} path={path} errors={errors} onChange={(next) => update(index, next)} /> : null}
            {block.type === "image" ? (
              <ImageSlot slot="blogInline" label="Image" value={block.image} error={errors[`${path}.image`]} altError={errors[`${path}.image.alt`]} onChange={(image) => update(index, { ...block, image })} />
            ) : null}
            {block.type === "table" ? <TableBlock block={block} path={path} errors={errors} onChange={(next) => update(index, next)} /> : null}
            {errors[path] ? <em className="error-text">{errors[path]}</em> : null}
          </section>
        );
      })}
      <div className="add-blocks" role="group" aria-label="Add a block">
        {Object.entries(LABELS).map(([type, label]) => (
          <button key={type} type="button" className="btn small" onClick={() => insert(type)} disabled={blocks.length >= 200}>
            + {label}
          </button>
        ))}
      </div>
      {errors.blocks ? <em className="error-text">{errors.blocks}</em> : null}
    </div>
  );
}
