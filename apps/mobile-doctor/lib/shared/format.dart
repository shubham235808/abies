/// Tiny date/label helpers — no `intl` dependency, same as apps/mobile.
/// Backend timestamps are ISO-8601 UTC strings (Prisma `DateTime` → JSON);
/// everything shown to the doctor is converted to device-local time.
DateTime? parseDate(Object? raw) => raw is String ? DateTime.tryParse(raw)?.toLocal() : null;

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

String formatTime(DateTime d) {
  final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final minute = d.minute.toString().padLeft(2, '0');
  return '$hour:$minute ${d.hour < 12 ? 'AM' : 'PM'}';
}

String formatDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

String formatDateTime(DateTime d) => '${formatDate(d)}, ${formatTime(d)}';

/// `YYYY-MM-DD` — what the backend's `isoDate` zod fields accept.
String isoDay(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

bool isSameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// `CONFIRMED` → `Confirmed`, `PENDING_PAYMENT` → `Pending payment`.
String humanizeEnum(String raw) {
  final lower = raw.replaceAll('_', ' ').toLowerCase();
  return lower.isEmpty ? lower : lower[0].toUpperCase() + lower.substring(1);
}

String? nonEmpty(String? s) => (s == null || s.trim().isEmpty) ? null : s;
