// EXPANSION-1d — plain <img>, not next/image: photoUrl points at a
// same-origin redirect route (/api/public/doctors/[slug]/photo) that
// 307s to a short-lived MinIO-signed URL; next/image's remote-pattern
// allowlist would need to know that signing host, which changes with
// storage config, for no real benefit on a small, already-compressed
// upload. Falls back to initials when no verified photo exists yet.
export function DoctorAvatar({ photoUrl, name, size = 48 }: { photoUrl: string | null; name: string; size?: number }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = name
    .split(' ')
    .filter((w) => w[0] && /[A-Za-z]/.test(w[0]))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-purple-100 font-semibold text-brand-purple-700"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || '—'}
    </span>
  );
}
