'use client';

import { useState } from 'react';

export function RepositoryUrlForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (url: string) => void;
  disabled: boolean;
}) {
  const [url, setUrl] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!disabled && url.trim()) onSubmit(url);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://github.com/owner/repo"
        aria-label="Repository URL"
        disabled={disabled}
        className="flex-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[#0b0d10] disabled:opacity-50"
      >
        Index
      </button>
    </form>
  );
}
