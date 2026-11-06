import { useState, type KeyboardEvent } from "react";
import { inputClass } from "./ui";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function EmailChips({
  emails,
  onChange,
  placeholder,
  ariaLabel,
  max = 2000,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
  placeholder: string;
  ariaLabel: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const commit = (raw: string) => {
    const parts = raw.split(/[,;\n]+/).map(normalize).filter(Boolean);
    if (parts.length === 0) {
      setDraft("");
      return;
    }
    const invalid = parts.find((email) => !EMAIL.test(email));
    if (invalid) {
      setError(`Enter a valid email: ${invalid}`);
      return;
    }
    const next = [...emails];
    for (const email of parts) {
      if (!next.includes(email)) next.push(email);
    }
    if (next.length > max) {
      setError(`You can add up to ${max} addresses.`);
      return;
    }
    onChange(next);
    setDraft("");
    setError("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && emails.length > 0) {
      onChange(emails.slice(0, -1));
    }
  };

  return (
    <div>
      <div className={`${inputClass} flex min-h-11 flex-wrap items-center gap-1.5`}>
        {emails.map((email) => (
          <span key={email} className="inline-flex items-center gap-1 rounded-full bg-tide-50 px-2 py-0.5 text-xs font-medium text-tide-700">
            {email}
            <button
              type="button"
              className="text-tide-700/70 hover:text-tide-700"
              aria-label={`Remove ${email}`}
              onClick={() => onChange(emails.filter((item) => item !== email))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-40 flex-1 bg-transparent py-1 outline-none"
          value={draft}
          placeholder={emails.length === 0 ? placeholder : "Add another"}
          aria-label={ariaLabel}
          onChange={(event) => {
            const value = event.target.value;
            if (/[,;\n]/.test(value)) commit(value);
            else {
              setDraft(value);
              setError("");
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => { if (draft.trim()) commit(draft); }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (/[,;\n]/.test(text)) {
              event.preventDefault();
              commit(`${draft}${text}`);
            }
          }}
        />
      </div>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
