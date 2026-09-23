import 'package:intl/intl.dart';

/// Formats an integer UZS amount for display. Mirrors backend/src/lib/money.ts
/// `formatUzs` — same grouping convention, so the same amount always looks the same
/// whether rendered by the backend-generated receipt or this app.
String formatUzs(int amountUzs, {String locale = 'uz'}) {
  final formatter = NumberFormat('#,###', 'ru_RU'); // ru_RU groups with a space, matches so'm convention
  final grouped = formatter.format(amountUzs.abs()).replaceAll(',', ' ');
  final sign = amountUzs < 0 ? '-' : '';
  final suffix = locale == 'ru' ? 'сум' : "so'm";
  return '$sign$grouped $suffix';
}
