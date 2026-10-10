import 'package:flutter/material.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/centre_models.dart';

class BookingStatusChip extends StatelessWidget {
  const BookingStatusChip({super.key, required this.status});

  final BookingStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = switch (status) {
      BookingStatus.completed => (scheme.tertiaryContainer, scheme.onTertiaryContainer),
      BookingStatus.cancelled => (scheme.errorContainer, scheme.onErrorContainer),
      BookingStatus.inProgress || BookingStatus.scheduled => (scheme.primaryContainer, scheme.onPrimaryContainer),
      _ => (scheme.secondaryContainer, scheme.onSecondaryContainer),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(status.label, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: fg)),
    );
  }
}

/// Error view that distinguishes "offline" from "something went wrong",
/// the same split apps/mobile's screens make.
Widget errorView(Object error, VoidCallback onRetry) {
  if (error is ApiException && error.isTransportFailure) return OfflineStateView(onRetry: onRetry);
  final message = error is ApiException ? error.message : 'Something went wrong. Please try again.';
  return ErrorStateView(message: message, onRetry: onRetry);
}

void showMessage(BuildContext context, String message, {bool isError = false}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: isError ? Theme.of(context).colorScheme.error : null,
    ),
  );
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
      child: Text(
        title.toUpperCase(),
        style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Theme.of(context).colorScheme.outline, letterSpacing: 0.8),
      ),
    );
  }
}
