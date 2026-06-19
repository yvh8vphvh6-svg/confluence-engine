import { BOOKS, BOOKS_NOTE } from "../../lib/education";

export default function BooksPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Books &amp; further reading</h1>
        <p className="text-sm text-muted">Foundational and broadly respected — a mix of skills, markets, and skepticism.</p>
      </header>

      <div className="space-y-3">
        {BOOKS.map((b) => (
          <div key={b.title} className="panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-text">{b.title}</p>
              <p className="shrink-0 text-xs text-muted">{b.author}</p>
            </div>
            <p className="mt-1 text-xs text-muted">{b.note}</p>
          </div>
        ))}
      </div>

      <div className="panel border-neon/30 p-4">
        <p className="text-sm text-text">{BOOKS_NOTE}</p>
      </div>
    </div>
  );
}
