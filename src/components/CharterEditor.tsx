"use client";
import { useState } from "react";
import { DEFAULT_PRINCIPLE } from "../sim/types";
const examples = {
  Balanced: DEFAULT_PRINCIPLE,
  Ambitious:
    "People in this city admire achievement, discipline and taking opportunities seriously.",
  Communal:
    "People in this city believe maintaining relationships and making time for others is important.",
  Restless:
    "People in this city admire novelty, spontaneity and unfamiliar experiences.",
};
export default function CharterEditor({
  principle,
  onApply,
}: {
  principle: string;
  onApply: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(principle);
  return (
    <section className="charter">
      <div className="section-title">
        <span>CITY PRINCIPLE</span>
        <button
          className="text-button"
          onClick={() => {
            setDraft(principle);
            setEditing(!editing);
          }}
        >
          {editing ? "Cancel" : "Edit ↗"}
        </button>
      </div>
      {editing ? (
        <>
          <label className="sr-only" htmlFor="principle">
            City principle
          </label>
          <textarea
            id="principle"
            maxLength={400}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="presets">
            {Object.entries(examples).map(([label, value]) => (
              <button key={label} onClick={() => setDraft(value)}>
                {label}
              </button>
            ))}
          </div>
          <button
            className="apply-button"
            disabled={!draft.trim()}
            onClick={() => {
              onApply(draft);
              setEditing(false);
            }}
          >
            Apply to future decisions ↗
          </button>
        </>
      ) : (
        <blockquote>“{principle}”</blockquote>
      )}
      <p className="small muted">
        One sentence. A soft cultural norm.
        <br />A different city, one decision at a time.
      </p>
    </section>
  );
}
