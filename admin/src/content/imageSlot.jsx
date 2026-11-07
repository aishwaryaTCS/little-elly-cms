/**
 * Image field for one slot (CONTENT_CMS_SPEC.md §6): shows the rule (IMG-7),
 * checks the photo in the browser, opens a crop step locked to the slot's shape
 * when needed (IMG-4), uploads, and edits alt text.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../api.js";
import { Req, TextField, useDialogFocus } from "./ui.jsx";

let slotsPromise;
export function loadSlots() {
  slotsPromise ||= api("/api/admin/image-slots").catch((error) => {
    slotsPromise = null;
    throw error;
  });
  return slotsPromise;
}

export function useSlot(name) {
  const [state, setState] = useState({ slot: null, maxBytes: 8 * 1024 * 1024 });
  useEffect(() => {
    let live = true;
    loadSlots()
      .then((data) => live && setState({ slot: data.slots[name], maxBytes: data.maxBytes }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [name]);
  return state;
}

const TOLERANCE = 0.01;

/** The shape a crop must have: the slot ratio, or the nearest allowed shape for free slots. */
function targetRatio(slot, width, height) {
  if (slot.ratio) return slot.ratio;
  const [low, high] = slot.range;
  return Math.min(high, Math.max(low, width / height));
}

function shapeOk(slot, width, height) {
  const actual = width / height;
  if (slot.ratio) return Math.abs(actual / slot.ratio - 1) <= TOLERANCE;
  const [low, high] = slot.range;
  return actual >= low * (1 - TOLERANCE) && actual <= high * (1 + TOLERANCE);
}

function sizeProblem(slot, width, height) {
  if (slot.min && (width < slot.min[0] || height < slot.min[1])) {
    return `This photo is too small. Use one at least ${slot.min[0]} × ${slot.min[1]} px.`;
  }
  if (slot.minLong && Math.max(width, height) < slot.minLong) return `This photo is too small. Use one with a long side of at least ${slot.minLong} px.`;
  if (slot.minWidth && width < slot.minWidth) return `This photo is too small. Use one at least ${slot.minWidth} px wide.`;
  return "";
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ url, image, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be opened as an image."));
    };
    image.src = url;
  });
}

export function ImageSlot({ slot: slotName, label, value, onChange, error, altError, optional = false, preview = "wide" }) {
  const { slot, maxBytes } = useSlot(slotName);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [crop, setCrop] = useState(null);
  const inputId = useId();

  async function upload(file) {
    setBusy(true);
    setProblem("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("slot", slotName);
      const data = await api("/api/admin/uploads", { method: "POST", body });
      onChange({ ...data.image, alt: value?.alt || "" });
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !slot) return;
    setProblem("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setProblem("Use a JPG, PNG or WebP image.");
    if (file.size > maxBytes) return setProblem("This file is over 8 MB. Use a smaller one.");
    let loaded;
    try {
      loaded = await readImage(file);
    } catch (err) {
      return setProblem(err.message);
    }
    if (shapeOk(slot, loaded.width, loaded.height)) {
      URL.revokeObjectURL(loaded.url);
      const tooSmall = sizeProblem(slot, loaded.width, loaded.height);
      if (tooSmall) return setProblem(tooSmall);
      return upload(file);
    }
    setCrop({ ...loaded, file, ratio: targetRatio(slot, loaded.width, loaded.height) });
  }

  const closeCrop = useCallback(() => {
    setCrop((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  return (
    <div className="image-slot">
      <span className="field-top">
        <span className="label">
          {label}
          {optional ? null : <Req />}
        </span>
      </span>
      <div className="image-slot-body">
        <div className={`slot-frame ${preview}`} style={slot?.ratio ? { aspectRatio: String(slot.ratio) } : undefined}>
          {value?.url ? <img src={value.url} alt="" /> : <span className="muted">No photo</span>}
        </div>
        <div className="list">
          <div className="row-actions">
            <input id={inputId} className="visually-hidden file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={busy || !slot} />
            <label className="btn" htmlFor={inputId} aria-disabled={busy || !slot}>
              {busy ? "Uploading…" : value ? "Replace photo" : "Upload photo"}
            </label>
            {value ? (
              <button className="btn ghost" type="button" onClick={() => onChange(null)} disabled={busy}>
                Remove
              </button>
            ) : null}
          </div>
          <small className="help">{slot?.help || "Loading size rules…"}</small>
          {value?.needsReplacing ? <span className="pill warn">Wrong shape or size. Upload a better photo.</span> : null}
          {problem ? <em className="error-text" role="alert">{problem}</em> : null}
          {error && !problem ? <em className="error-text">{error}</em> : null}
        </div>
      </div>
      {value ? (
        <TextField
          label="Alt text"
          hint="Describe the photo for screen readers and search."
          value={value.alt}
          max={125}
          min={5}
          error={altError}
          onChange={(alt) => onChange({ ...value, alt })}
        />
      ) : null}
      {crop ? (
        <CropDialog
          crop={crop}
          slot={slot}
          onCancel={closeCrop}
          onDone={(file) => {
            closeCrop();
            upload(file);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Crop step: a frame locked to the slot's shape over the photo. Drag or use the
 * arrow keys to move it; the slider or + / − to zoom. The crop is drawn at full
 * resolution and uploaded; the server still checks the result.
 */
function CropDialog({ crop, slot, onCancel, onDone }) {
  const ref = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  useDialogFocus(ref, onCancel);
  const { width: W, height: H, ratio } = crop;
  // Largest frame of this shape that fits the photo.
  const maxW = Math.min(W, H * ratio);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: W / 2, y: H / 2 });
  const cropW = maxW / zoom;
  const cropH = cropW / ratio;
  const x = Math.min(Math.max(center.x - cropW / 2, 0), W - cropW);
  const y = Math.min(Math.max(center.y - cropH / 2, 0), H - cropH);
  const tooSmall = sizeProblem(slot, Math.round(cropW), Math.round(cropH));

  function move(dx, dy) {
    setCenter({ x: x + cropW / 2 + dx, y: y + cropH / 2 + dy });
  }

  function onKey(event) {
    const step = Math.max(W, H) * 0.02;
    const keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (keys[event.key]) {
      event.preventDefault();
      move(...keys[event.key]);
    } else if (event.key === "+" || event.key === "=") {
      setZoom((value) => Math.min(4, value + 0.1));
    } else if (event.key === "-") {
      setZoom((value) => Math.max(1, value - 0.1));
    }
  }

  function scale() {
    return stageRef.current ? W / stageRef.current.clientWidth : 1;
  }

  function onPointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { px: event.clientX, py: event.clientY, cx: x + cropW / 2, cy: y + cropH / 2 };
  }

  function onPointerMove(event) {
    if (!dragRef.current) return;
    const s = scale();
    const start = dragRef.current;
    setCenter({ x: start.cx + (event.clientX - start.px) * s, y: start.cy + (event.clientY - start.py) * s });
  }

  async function finish() {
    const canvas = document.createElement("canvas");
    // Keep uploads light: the server stores at most 1600 px wide anyway.
    const outScale = Math.min(1, 2400 / Math.max(cropW, cropH));
    canvas.width = Math.round(cropW * outScale);
    canvas.height = Math.round(cropH * outScale);
    canvas.getContext("2d").drawImage(crop.image, x, y, cropW, cropH, 0, 0, canvas.width, canvas.height);
    const type = crop.file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
    onDone(new File([blob], type === "image/png" ? "crop.png" : "crop.jpg", { type }));
  }

  const pct = (value, total) => `${(value / total) * 100}%`;

  return (
    <div className="overlay">
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="crop-title" ref={ref}>
        <h2 id="crop-title">Crop to fit</h2>
        <p className="muted">
          This place needs a {slot.ratioText || "different"} shape. Move the frame to choose what shows. Arrow keys move it, + and − zoom.
        </p>
        <div className="crop-stage" ref={stageRef} style={{ aspectRatio: `${W} / ${H}` }}>
          <img src={crop.url} alt="" draggable="false" />
          <div
            className="crop-box"
            role="slider"
            tabIndex={0}
            aria-label="Crop frame position"
            aria-valuetext={`${Math.round(x)}, ${Math.round(y)}`}
            data-autofocus
            onKeyDown={onKey}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (dragRef.current = null)}
            style={{ left: pct(x, W), top: pct(y, H), width: pct(cropW, W), height: pct(cropH, H) }}
          />
        </div>
        <label className="field">
          <span>Zoom</span>
          <input type="range" min="1" max="4" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
        <p className="help">
          Result: {Math.round(cropW)} × {Math.round(cropH)} px
        </p>
        {tooSmall ? <em className="error-text" role="alert">{tooSmall.replace("This photo", "This crop")}</em> : null}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={finish} disabled={Boolean(tooSmall)}>
            Use this crop
          </button>
        </div>
      </div>
    </div>
  );
}
