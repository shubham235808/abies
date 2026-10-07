import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/appointment_summary.dart';
import '../domain/diagnostic_order_summary.dart';
import '../domain/diagnostic_preview.dart';
import '../domain/doctor_preview.dart';
import '../domain/medicine_order_summary.dart';
import '../domain/medicine_preview.dart';
import '../domain/panchakarma_booking_summary.dart';
import '../domain/panchakarma_preview.dart';
import 'home_controller.dart';

/// The real personalized home dashboard (docs/mobile/IMPLEMENTATION-PLAN.md
/// Phase 3), replacing the Phase 1/2 placeholder. Doctor/product detail and
/// any booking flow are deliberately not here yet — tapping a preview card
/// has nowhere real to go until Phase 4+ builds those screens (see
/// lib/features/home/PHASE.md).
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).value;
    final user = auth?.user;
    final homeAsync = ref.watch(homeControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('ABIES Ayurveda'),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            tooltip: 'Find a doctor',
            onPressed: () => context.push('/doctors'),
          ),
          IconButton(
            icon: const Icon(Icons.person_outline),
            tooltip: 'My profile',
            onPressed: () => context.push('/profile'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
          ),
        ],
      ),
      body: homeAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load your dashboard.',
          onRetry: () => ref.invalidate(homeControllerProvider),
        ),
        data: (data) => _HomeBody(data: data, greetingName: user?.email ?? user?.mobile),
      ),
    );
  }
}

class _HomeBody extends ConsumerWidget {
  const _HomeBody({required this.data, required this.greetingName});

  final HomeData data;
  final String? greetingName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(homeControllerProvider.notifier);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(homeControllerProvider.future),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          _WelcomeHeader(name: greetingName, city: data.city),
          _ListSection<AppointmentSummary>(
            title: 'Upcoming appointments',
            async: data.upcomingAppointments,
            emptyMessage: 'No upcoming appointments.',
            emptyIcon: Icons.event_available_outlined,
            onRetry: notifier.retryAppointments,
            itemBuilder: (context, appt) => _AppointmentTile(appointment: appt),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Text('Active orders', style: Theme.of(context).textTheme.titleLarge),
          ),
          _ListSection<MedicineOrderSummary>(
            title: 'Medicines',
            async: data.activeMedicineOrders,
            emptyMessage: 'No active medicine orders.',
            emptyIcon: Icons.medication_outlined,
            onRetry: notifier.retryMedicineOrders,
            itemBuilder: (context, order) => _MedicineOrderTile(order: order),
          ),
          _ListSection<DiagnosticOrderSummary>(
            title: 'Diagnostics',
            async: data.activeDiagnosticOrders,
            emptyMessage: 'No active diagnostic bookings.',
            emptyIcon: Icons.biotech_outlined,
            onRetry: notifier.retryDiagnosticOrders,
            itemBuilder: (context, order) => _DiagnosticOrderTile(order: order),
          ),
          _ListSection<PanchakarmaBookingSummary>(
            title: 'Panchakarma',
            async: data.activePanchakarmaBookings,
            emptyMessage: 'No active Panchakarma bookings.',
            emptyIcon: Icons.spa_outlined,
            onRetry: notifier.retryPanchakarmaBookings,
            itemBuilder: (context, booking) => _PanchakarmaBookingTile(booking: booking),
          ),
          _PreviewRow<DoctorPreview>(
            title: 'Doctors near you',
            async: data.doctors,
            emptyMessage: 'No doctors found for your area yet.',
            onRetry: notifier.retryDoctors,
            itemBuilder: (context, doctor) => _DoctorCard(doctor: doctor),
          ),
          _PreviewRow<PanchakarmaPreview>(
            title: 'Panchakarma therapies',
            async: data.panchakarma,
            emptyMessage: 'No Panchakarma therapies found for your area yet.',
            onRetry: notifier.retryPanchakarma,
            itemBuilder: (context, therapy) => _PanchakarmaCard(therapy: therapy),
          ),
          _PreviewRow<DiagnosticPreview>(
            title: 'Diagnostic tests',
            async: data.diagnostics,
            emptyMessage: 'No diagnostic tests found for your area yet.',
            onRetry: notifier.retryDiagnostics,
            itemBuilder: (context, test) => _DiagnosticCard(test: test),
          ),
          _PreviewRow<MedicinePreview>(
            title: 'Medicines',
            async: data.medicines,
            emptyMessage: 'No medicines found for your area yet.',
            onRetry: notifier.retryMedicines,
            itemBuilder: (context, medicine) => _MedicineCard(medicine: medicine),
          ),
        ],
      ),
    );
  }
}

class _WelcomeHeader extends StatelessWidget {
  const _WelcomeHeader({required this.name, required this.city});

  final String? name;
  final String? city;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Welcome${name != null ? ', $name' : ''}', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(
            city != null && city!.isNotEmpty
                ? 'Showing results near $city'
                : 'Add your city in your profile to see results near you',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

/// A vertically-stacked, non-scrolling section (appointments/orders) — each
/// one handles its own loading/empty/error state independently
/// (docs/mobile/IMPLEMENTATION-PLAN.md Phase 3's exit criterion), not just
/// the whole-screen `homeControllerProvider.when(...)` above.
class _ListSection<T> extends StatelessWidget {
  const _ListSection({
    required this.title,
    required this.async,
    required this.emptyMessage,
    required this.emptyIcon,
    required this.onRetry,
    required this.itemBuilder,
  });

  final String title;
  final AsyncValue<List<T>> async;
  final String emptyMessage;
  final IconData emptyIcon;
  final Future<void> Function() onRetry;
  final Widget Function(BuildContext, T) itemBuilder;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          async.when(
            loading: () => const Column(
              children: [
                Padding(padding: EdgeInsets.only(bottom: 8), child: LoadingSkeleton(height: 56)),
                Padding(padding: EdgeInsets.only(bottom: 8), child: LoadingSkeleton(height: 56)),
              ],
            ),
            error: (error, _) => ErrorStateView(
              message: error is ApiException ? error.message : 'Could not load this section.',
              onRetry: onRetry,
            ),
            data: (items) => items.isEmpty
                ? EmptyStateView(message: emptyMessage, icon: emptyIcon)
                : Column(children: items.map((item) => itemBuilder(context, item)).toList()),
          ),
        ],
      ),
    );
  }
}

/// A horizontal-scroll preview row (doctors/Panchakarma/diagnostics/
/// medicines) — same independent-section rule as [_ListSection].
class _PreviewRow<T> extends StatelessWidget {
  const _PreviewRow({
    required this.title,
    required this.async,
    required this.emptyMessage,
    required this.onRetry,
    required this.itemBuilder,
  });

  final String title;
  final AsyncValue<List<T>> async;
  final String emptyMessage;
  final Future<void> Function() onRetry;
  final Widget Function(BuildContext, T) itemBuilder;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(title, style: Theme.of(context).textTheme.titleMedium),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 190,
            child: async.when(
              loading: () => ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: 3,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (_, __) => const SizedBox(width: 160, child: LoadingSkeleton(height: 190)),
              ),
              error: (error, _) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ErrorStateView(
                  message: error is ApiException ? error.message : 'Could not load this section.',
                  onRetry: onRetry,
                ),
              ),
              data: (items) => items.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: EmptyStateView(message: emptyMessage, icon: Icons.search_off),
                    )
                  : ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 12),
                      itemBuilder: (context, i) => itemBuilder(context, items[i]),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AppointmentTile extends StatelessWidget {
  const _AppointmentTile({required this.appointment});

  final AppointmentSummary appointment;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(appointment.mode == 'VIDEO' ? Icons.videocam_outlined : Icons.local_hospital_outlined),
        title: Text(appointment.doctorName ?? 'Doctor'),
        subtitle: Text([
          _formatDateTime(appointment.scheduledAt),
          if (appointment.clinicName != null) appointment.clinicName!,
          if (appointment.familyMemberName != null) 'For ${appointment.familyMemberName}',
        ].join(' · ')),
        // Full cancel/review detail lives on the real "my appointments" list
        // (Phase 4) — this card is still just a dashboard preview.
        onTap: () => context.push('/appointments'),
      ),
    );
  }
}

class _MedicineOrderTile extends StatelessWidget {
  const _MedicineOrderTile({required this.order});

  final MedicineOrderSummary order;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const Icon(Icons.medication_outlined),
        title: Text(order.pharmacyName ?? 'Pharmacy order'),
        subtitle: Text('${order.itemCount} item${order.itemCount == 1 ? '' : 's'} · ${_statusLabel(order.status)}'),
      ),
    );
  }
}

class _DiagnosticOrderTile extends StatelessWidget {
  const _DiagnosticOrderTile({required this.order});

  final DiagnosticOrderSummary order;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const Icon(Icons.biotech_outlined),
        title: Text(order.labName ?? 'Diagnostic booking'),
        subtitle: Text('${order.itemCount} test${order.itemCount == 1 ? '' : 's'} · ${_statusLabel(order.status)}'),
      ),
    );
  }
}

class _PanchakarmaBookingTile extends StatelessWidget {
  const _PanchakarmaBookingTile({required this.booking});

  final PanchakarmaBookingSummary booking;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const Icon(Icons.spa_outlined),
        title: Text(booking.therapyName ?? 'Panchakarma booking'),
        subtitle: Text('${booking.centreName ?? ''} · ${booking.sessionCount} sessions · ${_statusLabel(booking.status)}'),
        // Full cancel/session detail lives on the real "my Panchakarma
        // bookings" list (Phase 5) — this card is still just a dashboard
        // preview, same rule as Phase 4's `_AppointmentTile`.
        onTap: () => context.push('/panchakarma/bookings'),
      ),
    );
  }
}

class _DoctorCard extends StatelessWidget {
  const _DoctorCard({required this.doctor});

  final DoctorPreview doctor;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => context.push('/doctor/${doctor.slug}'),
      child: _PreviewCard(
        leadingIcon: Icons.person_outline,
        title: doctor.name,
        subtitle: doctor.specialties.isNotEmpty ? doctor.specialties.first : (doctor.city ?? ''),
        trailing: [
          if (doctor.rating != null) Text('★ ${doctor.rating!.toStringAsFixed(1)}'),
          if (doctor.startingFee != null) Text('From ₹${doctor.startingFee}'),
        ],
      ),
    );
  }
}

class _PanchakarmaCard extends StatelessWidget {
  const _PanchakarmaCard({required this.therapy});

  final PanchakarmaPreview therapy;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      // Phase 3's preview card has no centre id, so it can't jump straight
      // to a specific therapy detail (there's no public single-therapy
      // route to resolve one by id anyway — see `PanchakarmaTherapy`'s doc
      // comment); the real Panchakarma search screen is the honest
      // destination, same "tile → list" shape as `_AppointmentTile`.
      onTap: () => context.push('/panchakarma'),
      child: _PreviewCard(
        leadingIcon: Icons.spa_outlined,
        title: therapy.name,
        subtitle: therapy.centreName ?? '',
        trailing: [
          Text('${therapy.durationMinutes} min'),
          Text('₹${therapy.price}'),
        ],
      ),
    );
  }
}

class _DiagnosticCard extends StatelessWidget {
  const _DiagnosticCard({required this.test});

  final DiagnosticPreview test;

  @override
  Widget build(BuildContext context) {
    return _PreviewCard(
      leadingIcon: Icons.biotech_outlined,
      title: test.name,
      subtitle: test.labName ?? '',
      trailing: [
        Text('${test.turnaroundHours}h report'),
        Text('₹${test.price}'),
      ],
    );
  }
}

class _MedicineCard extends StatelessWidget {
  const _MedicineCard({required this.medicine});

  final MedicinePreview medicine;

  @override
  Widget build(BuildContext context) {
    return _PreviewCard(
      leadingIcon: Icons.medication_outlined,
      title: medicine.name,
      subtitle: medicine.brandName ?? medicine.pharmacyName ?? '',
      trailing: [Text('₹${medicine.price}')],
    );
  }
}

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({required this.leadingIcon, required this.title, required this.subtitle, required this.trailing});

  final IconData leadingIcon;
  final String title;
  final String subtitle;
  final List<Widget> trailing;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(leadingIcon, size: 28, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 8),
              Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 4),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const Spacer(),
              Wrap(spacing: 8, children: trailing),
            ],
          ),
        ),
      ),
    );
  }
}

String _statusLabel(String status) {
  return status.split('_').map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}').join(' ');
}

String _formatDateTime(DateTime dt) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final hour12 = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final period = dt.hour >= 12 ? 'PM' : 'AM';
  final minute = dt.minute.toString().padLeft(2, '0');
  return '${dt.day} ${months[dt.month - 1]}, $hour12:$minute $period';
}
