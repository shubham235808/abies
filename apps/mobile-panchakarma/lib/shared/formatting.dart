/// Small, dependency-free date/money formatting (apps/mobile doesn't pull in
/// `intl` either). Always formats in the device's local time.
library;

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String formatDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

String formatTime(DateTime d) {
  final hour12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final minute = d.minute.toString().padLeft(2, '0');
  return '$hour12:$minute ${d.hour < 12 ? 'AM' : 'PM'}';
}

String formatDateTime(DateTime d) => '${formatDate(d)}, ${formatTime(d)}';

String formatRupees(int amount) => '₹$amount';
