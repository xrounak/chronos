"use client";

import { forwardRef } from "react";
import type { Look } from "./engine";
import { Icon } from "./Icons";

/** Swatches for each part you can change. "" for a supercar means each keeps its own colour. */
export const LOOK_OPTIONS: Record<keyof Look, Array<{ c: string; name: string }>> = {
  skin: [
    { c: "#f1c9a5", name: "Light" },
    { c: "#e0ac7e", name: "Wheat" },
    { c: "#d9a066", name: "Honey" },
    { c: "#b07a48", name: "Brown" },
    { c: "#7a4a26", name: "Deep" },
  ],
  hair: [
    { c: "#1d1813", name: "Black" },
    { c: "#3b2414", name: "Dark brown" },
    { c: "#6b3e1f", name: "Chestnut" },
    { c: "#c9a24a", name: "Blond" },
    { c: "#b5442d", name: "Red" },
    { c: "#8a8a8a", name: "Grey" },
  ],
  shirt: [
    { c: "#e2452b", name: "Chronos red" },
    { c: "#2453b3", name: "Blue" },
    { c: "#f4b536", name: "Mustard" },
    { c: "#1f9c86", name: "Teal" },
    { c: "#f08aa0", name: "Pink" },
    { c: "#fff3dc", name: "Cream" },
    { c: "#6a4c93", name: "Purple" },
    { c: "#1d1813", name: "Black" },
  ],
  pants: [
    { c: "#2c3a5a", name: "Denim" },
    { c: "#1d1813", name: "Black" },
    { c: "#6b4a2b", name: "Brown" },
    { c: "#4a4a4a", name: "Grey" },
    { c: "#c4a676", name: "Khaki" },
    { c: "#1f9c86", name: "Teal" },
  ],
  rover: [
    { c: "#e2452b", name: "Chronos red" },
    { c: "#2453b3", name: "Blue" },
    { c: "#f4b536", name: "Mustard" },
    { c: "#1f9c86", name: "Teal" },
    { c: "#f08aa0", name: "Pink" },
    { c: "#1d1813", name: "Black" },
  ],
  supercar: [
    { c: "", name: "Each its own" },
    { c: "#e2452b", name: "Rosso" },
    { c: "#f4b536", name: "Giallo" },
    { c: "#2453b3", name: "Blu" },
    { c: "#1f9c86", name: "Verde" },
    { c: "#f6f1e6", name: "Bianco" },
    { c: "#1d1813", name: "Nero" },
  ],
};

export const DEFAULT_LOOK: Look = { skin: "#d9a066", hair: "#3b2414", shirt: "#e2452b", pants: "#2c3a5a", rover: "#e2452b", supercar: "" };

const ROWS: Array<{ key: keyof Look; label: string; group: "You" | "Cars" }> = [
  { key: "skin", label: "Skin", group: "You" },
  { key: "hair", label: "Hair", group: "You" },
  { key: "shirt", label: "Shirt", group: "You" },
  { key: "pants", label: "Trousers", group: "You" },
  { key: "rover", label: "Rover paint", group: "Cars" },
  { key: "supercar", label: "Supercar paint", group: "Cars" },
];

/** The Customise dialog: your character's colours and the cars' paint, with a little preview. */
export const Customise = forwardRef<HTMLDialogElement, { look: Look; onPick: (key: keyof Look, value: string) => void; onReset: () => void }>(function Customise(
  { look, onPick, onReset },
  ref,
) {
  const close = () => (ref as React.RefObject<HTMLDialogElement | null>).current?.close();
  return (
    <dialog ref={ref} className="map-dialog custom-dialog" aria-labelledby="custom-title" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="flex flex-col gap-4 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label text-[0.62rem]">Make it yours</p>
            <h2 id="custom-title" className="display mt-1 text-3xl">
              Customise
            </h2>
          </div>
          <button type="button" className="chip" onClick={close} aria-label="Close">
            <Icon name="close" className="inline-ico" />
          </button>
        </div>

        <div className="custom-preview" aria-hidden="true">
          {/* a blocky little you, next to the rover */}
          <svg viewBox="0 0 120 70" className="custom-svg">
            <rect x="0" y="60" width="120" height="10" fill="#7fbf4d" />
            <g>
              <rect x="22" y="44" width="5" height="16" fill={look.pants} stroke="#1d1813" strokeWidth="1" />
              <rect x="28" y="44" width="5" height="16" fill={look.pants} stroke="#1d1813" strokeWidth="1" />
              <rect x="20" y="28" width="15" height="17" fill={look.shirt} stroke="#1d1813" strokeWidth="1" />
              <rect x="15.5" y="29" width="4.5" height="14" fill={look.skin} stroke="#1d1813" strokeWidth="1" />
              <rect x="35" y="29" width="4.5" height="14" fill={look.skin} stroke="#1d1813" strokeWidth="1" />
              <rect x="21.5" y="16" width="12" height="12" fill={look.skin} stroke="#1d1813" strokeWidth="1" />
              <rect x="21" y="13" width="13" height="5" fill={look.hair} stroke="#1d1813" strokeWidth="1" />
              <rect x="24" y="21" width="2" height="2" fill="#1d1813" />
              <rect x="29" y="21" width="2" height="2" fill="#1d1813" />
            </g>
            <g>
              <rect x="56" y="36" width="20" height="10" fill="#fff3dc" stroke="#1d1813" strokeWidth="1.2" />
              <rect x="50" y="44" width="34" height="10" fill={look.rover} stroke="#1d1813" strokeWidth="1.2" />
              <circle cx="57" cy="56" r="4.5" fill="#1d1813" />
              <circle cx="77" cy="56" r="4.5" fill="#1d1813" />
            </g>
            <g>
              <path d="M88 50 L96 44 L108 43 L118 48 L118 54 L88 54 Z" fill={look.supercar || "#f4b536"} stroke="#1d1813" strokeWidth="1.2" />
              <path d="M97 44 L101 39 L108 39 L111 44 Z" fill="#1d2a3a" stroke="#1d1813" strokeWidth="1" />
              <circle cx="94" cy="56" r="3.6" fill="#1d1813" />
              <circle cx="112" cy="56" r="3.6" fill="#1d1813" />
            </g>
          </svg>
        </div>

        {(["You", "Cars"] as const).map((group) => (
          <section key={group} className="flex flex-col gap-3">
            <p className="menu-head custom-head">{group === "You" ? "Your character" : "Your cars"}</p>
            {ROWS.filter((r) => r.group === group).map((r) => (
              <div key={r.key} className="custom-row">
                <span className="custom-label">{r.label}</span>
                <span className="custom-swatches" role="radiogroup" aria-label={r.label}>
                  {LOOK_OPTIONS[r.key].map((o) => (
                    <button
                      key={o.c || "own"}
                      type="button"
                      role="radio"
                      aria-checked={look[r.key] === o.c}
                      title={o.name}
                      aria-label={o.name}
                      className={`custom-swatch ${look[r.key] === o.c ? "is-on" : ""} ${o.c ? "" : "is-mixed"}`}
                      style={o.c ? { background: o.c } : undefined}
                      onClick={() => onPick(r.key, o.c)}
                    />
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="chip" onClick={onReset}>
            Reset to default
          </button>
          <button type="button" className="sticker" onClick={close}>
            Done <Icon name="check" className="btn-ico" />
          </button>
        </div>
      </div>
    </dialog>
  );
});
