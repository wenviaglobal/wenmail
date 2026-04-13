import { useState, useRef, useCallback } from "react";
import { X } from "lucide-react";

interface EmailChipsProps {
  value: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function EmailChips({ value, onChange, placeholder = "Add email..." }: EmailChipsProps) {
  const [input, setInput] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addEmails = useCallback((text: string) => {
    // Split by comma, semicolon, space, or newline
    const parts = text.split(/[,;\s\n]+/).map(e => e.trim().toLowerCase()).filter(e => e && isValidEmail(e));
    if (parts.length === 0) return;
    const unique = parts.filter(e => !value.includes(e));
    if (unique.length > 0) onChange([...value, ...unique]);
    setInput("");
  }, [value, onChange]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (input.trim()) addEmails(input);
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    addEmails(text);
  }

  function handleBlur() {
    if (input.trim()) addEmails(input);
  }

  function removeEmail(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function startEdit(index: number) {
    setEditIndex(index);
    setInput(value[index]);
    onChange(value.filter((_, i) => i !== index));
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1 min-h-[36px] cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((email, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full px-2.5 py-0.5 text-xs font-medium group transition-all hover:bg-indigo-200 dark:hover:bg-indigo-900/50"
        >
          <span
            onDoubleClick={() => startEdit(i)}
            className="cursor-pointer max-w-[200px] truncate"
            title={`Double-click to edit: ${email}`}
          >
            {email}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeEmail(i); }}
            className="text-indigo-400 hover:text-red-500 transition ml-0.5"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] text-sm outline-none bg-transparent dark:text-white py-1"
      />
    </div>
  );
}
