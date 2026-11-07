/**
 * Shared pieces for the content screens: counted text fields, colour picker,
 * confirm dialog, toasts, unsaved-change guard, order buttons, status chip.
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

export const ACCENTS = ["coral", "orange", "yellow", "turquoise", "periwinkle", "pink", "cyan"];

/** Text input or textarea with a live character counter (UI-5). */
export function TextField({ label, value, onChange, max, min = 0, error, hint, area = false, rows = 3, placeholder, wide, mono, required, inputProps = {} }) {
  const id = useId();
  const req = required ?? min > 0;
  const length = String(value ?? "").length;
  const state = max && length > max ? "over" : max && length > max * 0.9 ? "near" : "";
  const Tag = area ? "textarea" : "input";
  return (
    <div className={`field${wide ? " span-2" : ""}`}>
      <span className="field-top">
        <label htmlFor={id}>
          {label}
          {req ? <Req /> : null}
        </label>
        {max ? (
          <span className={`counter ${state}`} aria-live="polite">
            {length}/{max}
          </span>
        ) : null}
      </span>
      <Tag
        id={id}
        className={mono ? "mono" : undefined}
        value={value ?? ""}
        rows={area ? rows : undefined}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={error ? "true" : undefined}
        aria-required={req || undefined}
        aria-describedby={error || hint ? `${id}-help` : undefined}
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
      />
      {error || hint ? (
        <span id={`${id}-help`} className="field-help">
          {error ? <em>{error}</em> : null}
          {!error && hint ? <small>{hint}</small> : null}
        </span>
      ) : null}
    </div>
  );
}

export function AccentPicker({ label, value, onChange, error }) {
  const name = useId();
  return (
    <fieldset className="field accent-picker">
      <legend>
        {label}
        <Req />
      </legend>
      <div className="swatches">
        {ACCENTS.map((accent) => (
          <label key={accent} className={value === accent ? "swatch on" : "swatch"}>
            <input type="radio" name={name} value={accent} checked={value === accent} onChange={() => onChange(accent)} />
            <span className="dot" style={{ background: `var(--${accent})` }} aria-hidden="true" />
            <span className="swatch-name">{accent}</span>
          </label>
        ))}
      </div>
      {error ? <em className="error-text">{error}</em> : null}
    </fieldset>
  );
}

/** Marks a required field. */
export function Req() {
  return (
    <span className="req" aria-hidden="true">
      {" "}*
    </span>
  );
}

/**
 * Sections where only one is open at a time: opening one closes the other.
 * items: [{ title, content, badge? }]
 */
export function Panels({ items, initial = 0 }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="panels">
      {items.filter(Boolean).map((item, index) => (
        <section key={item.title} className={open === index ? "panel open" : "panel"}>
          <button type="button" className="panel-head" aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}>
            <span>{item.title}</span>
            {item.badge ? <span className="pill warn">{item.badge}</span> : null}
            <span className="chev" aria-hidden="true">{open === index ? "−" : "+"}</span>
          </button>
          {open === index ? <div className="panel-body">{item.content}</div> : null}
        </section>
      ))}
    </div>
  );
}

/** People consent: when a photo or name shows a person, both approvals are needed to publish. */
export function ConsentField({ value, onChange, error }) {
  const c = value || { hasPeople: false, photoAllowed: false, nameAllowed: false };
  const set = (key, next) => onChange({ ...c, [key]: next, ...(key === "hasPeople" && !next ? { photoAllowed: false, nameAllowed: false } : {}) });
  return (
    <div className="consent">
      <label className="switch">
        <input type="checkbox" checked={c.hasPeople} onChange={(e) => set("hasPeople", e.target.checked)} />
        <span>
          <b>Shows a person's photo or name</b>
          <small>A child, parent, teacher or anyone identifiable.</small>
        </span>
      </label>
      {c.hasPeople ? (
        <div className="consent-approvals">
          <label className="switch">
            <input type="checkbox" checked={c.photoAllowed} onChange={(e) => set("photoAllowed", e.target.checked)} />
            <span>
              <b>Photo use approved<Req /></b>
              <small>By the person or a parent.</small>
            </span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={c.nameAllowed} onChange={(e) => set("nameAllowed", e.target.checked)} />
            <span>
              <b>Name use approved<Req /></b>
              <small>By the person or a parent.</small>
            </span>
          </label>
        </div>
      ) : null}
      {error ? <em className="error-text">{error}</em> : null}
    </div>
  );
}

export const emptyConsent = () => ({ hasPeople: false, photoAllowed: false, nameAllowed: false });
export const toConsent = (value = {}) => ({
  hasPeople: Boolean(value.hasPeople),
  photoAllowed: Boolean(value.photoAllowed),
  nameAllowed: Boolean(value.nameAllowed),
});

export function StatusChip({ status }) {
  return <span className={`pill ${status}`}>{status === "published" ? "Live" : "Draft"}</span>;
}

export function OrderButtons({ index, count, onMove, label }) {
  return (
    <span className="order">
      <button type="button" className="btn small icon" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${label} up`}>
        ↑
      </button>
      <button type="button" className="btn small icon" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label={`Move ${label} down`}>
        ↓
      </button>
    </span>
  );
}

// ------------------------------------------------------------- dialogs

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setDialog({ ...options, resolve });
      }),
    [],
  );

  const toast = useCallback((message, kind = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 3200);
  }, []);

  function close(result) {
    dialog?.resolve(result);
    setDialog(null);
  }

  return (
    <DialogContext.Provider value={{ confirm, toast }}>
      {children}
      {dialog ? <ConfirmDialog {...dialog} onClose={close} /> : null}
      <div className="toasts" aria-live="polite" role="status">
        {toasts.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`}>
            {item.message}
          </div>
        ))}
      </div>
    </DialogContext.Provider>
  );
}

export function useDialogs() {
  return useContext(DialogContext);
}

/** Keeps Tab inside the dialog and closes it on Esc (UI-7). */
export function useDialogFocus(ref, onEscape) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const previous = document.activeElement;
    const focusable = () =>
      [...node.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
        (element) => !element.disabled && element.offsetParent !== null,
      );
    (node.querySelector("[data-autofocus]") || focusable()[0])?.focus();
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [ref]);
}

function ConfirmDialog({ title, body, confirmLabel = "Confirm", danger = false, typeToConfirm, onClose }) {
  const ref = useRef(null);
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const escape = useCallback(() => onClose(false), [onClose]);
  useDialogFocus(ref, escape);
  const blocked = typeToConfirm && typed !== typeToConfirm;
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose(false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <h2 id={titleId}>{title}</h2>
        {body ? <p className="muted">{body}</p> : null}
        {typeToConfirm ? (
          <label className="field">
            <span>
              Type <code>{typeToConfirm}</code> to confirm
            </span>
            <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" data-autofocus />
          </label>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={() => onClose(false)} data-autofocus={typeToConfirm ? undefined : true}>
            Cancel
          </button>
          <button type="button" className={danger ? "btn danger" : "btn primary"} disabled={blocked} onClick={() => onClose(typed || true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Asks before leaving a form with unsaved changes (UI-5): in-app links and the browser. */
export function useUnsavedGuard(dirty) {
  const { confirm } = useDialogs();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    confirm({ title: "Leave without saving?", body: "Your changes on this page will be lost.", confirmLabel: "Leave", danger: true }).then(
      (ok) => (ok ? blocker.proceed() : blocker.reset()),
    );
  }, [blocker, confirm]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

export function smallestUrl(image) {
  if (!image) return "";
  const variants = [...(image.variants || [])].sort((a, b) => a.width - b.width);
  return variants[0]?.url || image.url;
}

export function NeedsPhoto({ images }) {
  if (!images.some((image) => image?.needsReplacing)) return null;
  return <span className="pill warn" title="This photo is not the right shape or size for its place.">Photo to replace</span>;
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
