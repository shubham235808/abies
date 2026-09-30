// EXPANSION-1d — the reference UI shows a prominent live video-call area;
// this platform has no connected video provider (src/lib/video/index.ts's
// own resolveJoinInfo() message says so explicitly). Redesigning this into
// a visually substantial "camera off" panel gives it the layout weight the
// reference implies, without ever rendering anything that looks like an
// active call — restyling the previous thin text banner would risk
// exactly that misread, so this keeps the same honest message but frames
// it inside a dark, clearly-inert video-tile area instead.
export function VideoCallPanel({
  message,
  joinedAt,
}: {
  message: string;
  joinedAt?: { doctor: string | null; patient: string | null };
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-card border border-brand-neutral-800 bg-brand-neutral-900">
      <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-white/40" aria-hidden="true">
          <path d="M3 6.75A2.25 2.25 0 0 1 5.25 4.5h7.5A2.25 2.25 0 0 1 15 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-7.5A2.25 2.25 0 0 1 3 17.25V6.75Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="m17.25 9 3.15-2.1a.75.75 0 0 1 1.1.66v8.88a.75.75 0 0 1-1.1.66l-3.15-2.1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M2 2 22 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p className="max-w-md text-sm text-white/80">{message}</p>
      </div>
      {joinedAt && (
        <div className="border-t border-white/10 px-4 py-2 text-xs text-white/50">
          You joined: {joinedAt.doctor ? new Date(joinedAt.doctor).toLocaleTimeString() : 'not yet'} · Patient joined:{' '}
          {joinedAt.patient ? new Date(joinedAt.patient).toLocaleTimeString() : 'not yet'}
        </div>
      )}
    </div>
  );
}
