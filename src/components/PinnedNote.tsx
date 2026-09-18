"use client";

import { useEffect, useRef, useState } from "react";
import { Pin } from "lucide-react";
import { Collapse } from "./motion";

/** Pinned per-exercise note. Tap to edit; saves on blur. */
export default function PinnedNote({
  note,
  onSave,
  editing: editingProp,
  onEditingChange,
  placeholder = "T.ex. säte hål 4, brett grepp, stopp 2 cm ovan bröstet",
}: {
  note: string;
  onSave: (n: string) => void;
  editing?: boolean;
  onEditingChange?: (e: boolean) => void;
  placeholder?: string;
}) {
  const [editingState, setEditingState] = useState(false);
  const editing = editingProp ?? editingState;
  const setEditing = (e: boolean) => (onEditingChange ? onEditingChange(e) : setEditingState(e));
  const [text, setText] = useState(note);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setText(note), [note]);
  useEffect(() => {
    if (editing) setTimeout(() => ref.current?.focus(), 50);
  }, [editing]);

  return (
    <>
      {!editing && note && (
        <button onClick={() => setEditing(true)} className="mt-1.5 flex w-full items-start gap-1.5 rounded-lg bg-sky/10 px-2 py-1.5 text-left text-xs text-sky ring-1 ring-sky/20">
          <Pin size={12} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-line">{note}</span>
        </button>
      )}
      <Collapse open={editing}>
        <div className="mt-1.5">
          <textarea
            ref={ref}
            rows={2}
            className="input text-sm"
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (text.trim() !== note.trim()) onSave(text);
              setEditing(false);
            }}
          />
          <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-3">
            <Pin size={11} /> Fast notering – visas varje gång du kör övningen
          </div>
        </div>
      </Collapse>
    </>
  );
}
