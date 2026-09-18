"use client";

import { useState } from "react";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback untuk konteks tanpa izin clipboard: pilih teksnya supaya bisa disalin manual.
      const range = document.createRange();
      const node = document.getElementById(`copy-${label}`);
      if (node) {
        range.selectNodeContents(node);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="copy-row">
      <code id={`copy-${label}`} aria-label={label}>{value}</code>
      <button type="button" className="btn btn-small" onClick={copy}>{copied ? "Tersalin ✓" : "Salin"}</button>
    </div>
  );
}
