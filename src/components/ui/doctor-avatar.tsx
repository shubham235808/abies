// EXPANSION-1d — plain <img>, not next/image: photoUrl points at a
// same-origin redirect route (/api/public/doctors/[slug]/photo) that
// 307s to a short-lived MinIO-signed URL; next/image's remote-pattern
// allowlist would need to know that signing host, which changes with
// storage config, for no real benefit on a small, already-compressed
// upload. Falls back to initials when no verified photo exists yet.
export function DoctorAvatar({ photoUrl, name, size = 48 }: { photoUrl: string | null; name: string; size?: number }) {
  const radius = Math.round(size * 0.27);

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 object-cover"
        style={{ width: size, height: size, borderRadius: radius }}
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
      className="flex shrink-0 items-center justify-center bg-gradient-to-br from-brand-purple-100 to-brand-blue-100 font-bold text-brand-purple-700"
      style={{ width: size, height: size, fontSize: size * 0.4, borderRadius: radius }}
    >
      {initials || '—'}
    </span>
  );
}
