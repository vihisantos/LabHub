export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-line bg-card/50 p-4">
      <div className="flex items-start gap-3">
        <div className="skeleton-shimmer h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="skeleton-shimmer h-4 w-3/5 rounded" />
          <div className="skeleton-shimmer h-3 w-2/5 rounded" />
        </div>
        <div className="skeleton-shimmer h-7 w-20 rounded-md" />
      </div>
      <div className="skeleton-shimmer mt-3 h-3 w-full rounded" />
      <div className="mt-2 flex gap-3">
        <div className="skeleton-shimmer h-3 w-12 rounded" />
        <div className="skeleton-shimmer h-3 w-12 rounded" />
      </div>
    </div>
  )
}

export function SkeletonStatCard() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-line">
      <div className="mb-3 flex items-center justify-between">
        <div className="skeleton-shimmer h-3 w-16 rounded" />
        <div className="skeleton-shimmer h-7 w-7 rounded-lg" />
      </div>
      <div className="skeleton-shimmer h-8 w-12 rounded" />
    </div>
  )
}

export function SkeletonTimeline() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg bg-input/50 px-3 py-2.5">
          <div className="skeleton-shimmer h-5 w-5 rounded" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton-shimmer h-3 w-4/5 rounded" />
            <div className="skeleton-shimmer h-2.5 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
