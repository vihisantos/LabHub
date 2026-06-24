export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-slate-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/5 rounded bg-slate-800" />
          <div className="h-3 w-2/5 rounded bg-slate-800/50" />
        </div>
        <div className="h-7 w-20 rounded-md bg-slate-800" />
      </div>
      <div className="mt-3 h-3 w-full rounded bg-slate-800" />
      <div className="mt-2 flex gap-3">
        <div className="h-3 w-12 rounded bg-slate-800/50" />
        <div className="h-3 w-12 rounded bg-slate-800/50" />
      </div>
    </div>
  )
}

export function SkeletonStatCard() {
  return (
    <div className="animate-pulse rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-3 w-16 rounded bg-slate-800" />
        <div className="h-7 w-7 rounded-lg bg-slate-800" />
      </div>
      <div className="h-8 w-12 rounded bg-slate-800" />
    </div>
  )
}

export function SkeletonTimeline() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse flex items-start gap-3 rounded-lg bg-slate-800/50 px-3 py-2.5">
          <div className="h-5 w-5 rounded bg-slate-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-4/5 rounded bg-slate-800" />
            <div className="h-2.5 w-2/5 rounded bg-slate-800/50" />
          </div>
        </div>
      ))}
    </div>
  )
}
