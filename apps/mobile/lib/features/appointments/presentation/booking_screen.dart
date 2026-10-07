import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../../doctors/domain/doctor_detail.dart';
import '../../doctors/presentation/doctor_detail_controller.dart';
import '../../profile/presentation/profile_controller.dart';
import '../domain/appointment_slot.dart';
import 'booking_controller.dart';

const _monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// The booking flow (docs/mobile/IMPLEMENTATION-PLAN.md Phase 4): slot
/// selection → hold → payment-or-unavailable → confirmation. Reached from
/// `DoctorDetailScreen`'s "Book" button (`/doctor/:slug/book`, `extra:
/// {'mode': ...}`) or directly as a deep link, so it resolves the doctor
/// itself via [doctorDetailProvider] rather than assuming its caller already
/// has that data.
class BookingScreen extends ConsumerWidget {
  const BookingScreen({super.key, required this.slug, this.initialMode});

  final String slug;
  final String? initialMode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(doctorDetailProvider(slug));
    return Scaffold(
      appBar: AppBar(title: const Text('Book appointment')),
      body: detailAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load this doctor.',
          onRetry: () => ref.invalidate(doctorDetailProvider(slug)),
        ),
        data: (data) {
          final doctor = data.doctor;
          if (doctor.consultationModes.isEmpty) {
            return const EmptyStateView(message: 'This doctor has no consultation modes configured yet.');
          }
          final mode = (initialMode != null && doctor.consultationModes.contains(initialMode))
              ? initialMode!
              : doctor.consultationModes.first;
          final params = BookingParams(doctorProfileId: doctor.id, initialMode: mode);
          return _BookingBody(doctor: doctor, params: params);
        },
      ),
    );
  }
}

class _BookingBody extends ConsumerWidget {
  const _BookingBody({required this.doctor, required this.params});

  final DoctorDetail doctor;
  final BookingParams params;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(bookingControllerProvider(params));
    final controller = ref.read(bookingControllerProvider(params).notifier);
    final profileAsync = ref.watch(profileControllerProvider);
    final familyMembers = profileAsync.value?.profile.familyMembers ?? const [];
    final fee = doctor.feeFor(state.mode);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(doctor.name, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(fee != null ? 'Fee: ₹$fee' : 'Fee not set for this mode'),
        const SizedBox(height: 16),
        if (doctor.consultationModes.length > 1) ...[
          SegmentedButton<String>(
            segments: doctor.consultationModes
                .map((m) => ButtonSegment(value: m, label: Text(m == 'VIDEO' ? 'Video' : 'Clinic')))
                .toList(),
            selected: {state.mode},
            onSelectionChanged: (selection) => controller.changeMode(selection.first),
          ),
          const SizedBox(height: 16),
        ],
        Text('Choose a time', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        state.slots.when(
          loading: () => const LoadingSkeleton(height: 120),
          error: (error, _) => ErrorStateView(
            message: error is ApiException ? error.message : 'Could not load available times.',
            onRetry: controller.retrySlots,
          ),
          data: (slots) => slots.isEmpty
              ? const EmptyStateView(message: 'No upcoming availability for this mode in the next two weeks.', icon: Icons.event_busy_outlined)
              : _SlotGrid(slots: slots, selected: state.selectedSlot, onSelect: controller.selectSlot),
        ),
        if (familyMembers.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('Who is this for?', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          DropdownButtonFormField<String?>(
            initialValue: state.careRecipientFamilyMemberId,
            decoration: const InputDecoration(border: OutlineInputBorder()),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('Myself')),
              ...familyMembers.map((m) => DropdownMenuItem<String?>(value: m.id, child: Text(m.name))),
            ],
            onChanged: controller.setFamilyMember,
          ),
        ],
        const SizedBox(height: 16),
        Text('Reason for visit (optional)', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        TextField(
          maxLines: 3,
          maxLength: 1000,
          decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'What would you like to discuss?'),
          onChanged: controller.setReasonForVisit,
        ),
        const SizedBox(height: 16),
        _HoldOutcomeBanner(outcome: state.holdOutcome),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: (state.selectedSlot == null || state.submitting) ? null : controller.confirmBooking,
          child: state.submitting
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Confirm booking'),
        ),
      ],
    );
  }
}

class _SlotGrid extends StatelessWidget {
  const _SlotGrid({required this.slots, required this.selected, required this.onSelect});

  final List<AppointmentSlot> slots;
  final AppointmentSlot? selected;
  final ValueChanged<AppointmentSlot> onSelect;

  @override
  Widget build(BuildContext context) {
    // Grouped by calendar day, in the order the backend already returns
    // them (chronological) — no client-side re-sorting of "availability".
    final byDay = <String, List<AppointmentSlot>>{};
    for (final slot in slots) {
      final key = '${slot.startsAt.year}-${slot.startsAt.month}-${slot.startsAt.day}';
      byDay.putIfAbsent(key, () => []).add(slot);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: byDay.entries.map((entry) {
        final day = entry.value.first.startsAt;
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${day.day} ${_monthNames[day.month - 1]}', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 4),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: entry.value.map((slot) {
                  final isSelected = selected == slot;
                  return ChoiceChip(
                    label: Text(_timeLabel(slot.startsAt)),
                    selected: isSelected,
                    onSelected: (_) => onSelect(slot),
                  );
                }).toList(),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  String _timeLabel(DateTime dt) {
    final hour12 = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final period = dt.hour >= 12 ? 'PM' : 'AM';
    final minute = dt.minute.toString().padLeft(2, '0');
    return '$hour12:$minute $period';
  }
}

class _HoldOutcomeBanner extends StatelessWidget {
  const _HoldOutcomeBanner({required this.outcome});

  final HoldOutcome outcome;

  @override
  Widget build(BuildContext context) {
    switch (outcome.kind) {
      case HoldOutcomeKind.none:
        return const SizedBox.shrink();
      case HoldOutcomeKind.success:
        final hold = outcome.hold!;
        return Card(
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Slot held — complete payment to confirm'),
                Text('Amount: ₹${hold.amount}'),
                Text('Order: ${hold.razorpayOrderId}'),
                const SizedBox(height: 8),
                // Deliberately no real Razorpay SDK call here
                // (docs/mobile/IMPLEMENTATION-PLAN.md Phase 8 — mobile
                // doesn't integrate a payment SDK until real
                // RAZORPAY_KEY_ID/SECRET are confirmed configured
                // somewhere this app can be tested against). The backend's
                // own `/verify-payment` response, not any client-side
                // provider callback, is what would confirm this
                // appointment — see `AppointmentsApi.verifyPayment`.
                const Text(
                  'Real payment capture is a Phase 8 dependency, not implemented in this build. '
                  'This slot is held for 10 minutes but the appointment will not be confirmed from this screen.',
                  style: TextStyle(fontStyle: FontStyle.italic),
                ),
              ],
            ),
          ),
        );
      case HoldOutcomeKind.serviceUnavailable:
        return Card(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: Theme.of(context).colorScheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    outcome.message ?? "Booking isn't available in this environment yet.",
                  ),
                ),
              ],
            ),
          ),
        );
      case HoldOutcomeKind.conflict:
        return Card(
          color: Theme.of(context).colorScheme.errorContainer,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Text(outcome.message ?? 'This slot is no longer available — please pick another.'),
          ),
        );
      case HoldOutcomeKind.error:
        return Card(
          color: Theme.of(context).colorScheme.errorContainer,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Text(outcome.message ?? 'Something went wrong. Please try again.'),
          ),
        );
    }
  }
}
