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
        className="flex-1 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm outline-none placeholder:text-ink-muted focus:border-accent disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
      >
        Index
      </button>
    </form>
  );
}
