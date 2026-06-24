import { SOURCES, SOURCES_NOTE } from "../../lib/education";

export default function SourcesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Peer review &amp; sources</h1>
        <p className="text-sm text-muted">
          Verified, reputable starting points. Verify the details yourself — that&apos;s the point.
        </p>
      </header>

      <div className="space-y-3">
        {SOURCES.map((s) => (
          <div key={s.citation} className="panel p-4">
            <p className="text-sm text-text">{s.citation}</p>
            <p className="mt-2 text-xs text-neon">{s.finding}</p>
            {s.url && (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-block break-all text-xs text-accent underline"
              >
                {s.url}
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="panel border-warn/30 p-4">
        <p className="panel-head mb-1 text-warn">How to read trading research without fooling yourself</p>
        <p className="text-sm text-text">{SOURCES_NOTE}</p>
      </div>
    </div>
  );
}
