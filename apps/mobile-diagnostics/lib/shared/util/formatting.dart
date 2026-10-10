/// Small, dependency-free formatting helpers (no `intl` in this app, same
/// as apps/mobile). All times are shown in the device's local time zone.
const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String formatDateTime(DateTime dt) {
  final local = dt.toLocal();
  final hour12 = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final minute = local.minute.toString().padLeft(2, '0');
  final period = local.hour < 12 ? 'AM' : 'PM';
  return '${local.day} ${_months[local.month - 1]} ${local.year}, $hour12:$minute $period';
}

/// Prices are whole rupees on the backend (`price Int` on DiagnosticTest /
/// DiagnosticPackage / DiagnosticOrderItem; the web portal renders `₹{price}`).
String formatRupees(int amount) => '₹$amount';

DateTime? parseDateOrNull(Object? raw) => raw is String ? DateTime.tryParse(raw) : null;

bool isSameLocalDay(DateTime a, DateTime b) {
  final x = a.toLocal();
  final y = b.toLocal();
  return x.year == y.year && x.month == y.month && x.day == y.day;
}
