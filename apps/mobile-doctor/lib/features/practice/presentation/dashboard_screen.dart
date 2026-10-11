import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/format.dart';
import '../../../shared/widgets/state_views.dart';
import '../../../shared/widgets/status_chip.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/doctor_appointment.dart';
import '../domain/doctor_profile.dart';
import 'dashboard_controller.dart';

/// Home: verification state + upcoming consultations — the mobile port of
/// apps/partner-web/src/app/partner/doctor/page.tsx (overview) merged with
/// .../appointments/page.tsx (the full list).
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardControllerProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('ABIES for Doctors'),
        actions: [
          IconButton(
            tooltip: 'Availability',
            icon: const Icon(Icons.event_available_outlined),
            onPressed: () => context.push('/availability'),
          ),
          IconButton(
            tooltip: 'Profile',
            icon: const Icon(Icons.person_outline),
            onPressed: () => context.push('/profile'),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => e is ApiException && e.isTransportFailure
            ? OfflineStateView(onRetry: () => ref.invalidate(dashboardControllerProvider))
            : ErrorStateView(
                message: e is ApiException ? e.message : 'Could not load your dashboard.',
                onRetry: () => ref.invalidate(dashboardControllerProvider),
              ),
        data: (data) => RefreshIndicator(
          onRefresh: () => ref.read(dashboardControllerProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _Header(profile: data.profile),
              const SizedBox(height: 16),
              if (!data.profile.isApproved)
                _VerificationCard(profile: data.profile)
              else ...[
                _NextPatientCard(next: data.nextPatient),
                const SizedBox(height: 24),
                _Section(
                  title: "Today's schedule",
                  empty: 'No appointments today.',
                  appointments: data.todaysSchedule,
                ),
                const SizedBox(height: 24),
                _Section(
                  title: 'Upcoming consultations (${data.upcoming.length})',
                  empty: 'No upcoming consultations.',
                  appointments: data.upcoming,
                ),
                const SizedBox(height: 24),
                _Section(
                  title: 'Past & cancelled',
                  empty: 'Nothing here yet.',
                  appointments: data.history.take(20).toList(),
                ),
              ],
              const SizedBox(height: 24),
              Center(
                child: TextButton.icon(
                  icon: const Icon(Icons.logout),
                  label: const Text('Sign out'),
                  onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.profile});

  final DoctorProfile profile;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(profile.displayName, style: Theme.of(context).textTheme.headlineSmall)),
        StatusChip(profile.verificationStatus),
      ],
    );
  }
}

class _VerificationCard extends StatelessWidget {
  const _VerificationCard({required this.profile});

  final DoctorProfile profile;

  @override
  Widget build(BuildContext context) {
    final String message = switch (profile.verificationStatus) {
      'SUBMITTED' || 'UNDER_REVIEW' =>
        "Your application is with the ABIES verification team. You'll be notified once it's reviewed.",
      'SUSPENDED' => 'Your account has been suspended${profile.rejectionReason != null ? ': ${profile.rejectionReason}' : '.'} '
          'Contact ABIES support.',
      'REJECTED' => 'Your last application was rejected${profile.rejectionReason != null ? ': ${profile.rejectionReason}' : '.'} '
          'Update your details and resubmit.',
      _ => 'Complete your profile, upload your registration documents, add clinics and availability, '
          'then submit your application for verification.',
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your application', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(message),
            if (!profile.isEditableApplication && profile.documents.any((d) => d.needsResubmission)) ...[
              const SizedBox(height: 12),
              const Text('The verification team has asked you to resubmit a document.'),
              const SizedBox(height: 8),
              FilledButton.tonal(onPressed: () => context.push('/documents'), child: const Text('Review documents')),
            ],
            if (profile.isEditableApplication) ...[
              const SizedBox(height: 16),
              Text('Application completeness: ${profile.completion}%'),
              const SizedBox(height: 6),
              LinearProgressIndicator(value: profile.completion / 100),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton.tonal(onPressed: () => context.push('/profile'), child: const Text('Profile & submit')),
                  OutlinedButton(onPressed: () => context.push('/documents'), child: const Text('Documents')),
                  OutlinedButton(onPressed: () => context.push('/clinics'), child: const Text('Clinics')),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _NextPatientCard extends StatelessWidget {
  const _NextPatientCard({required this.next});

  final DoctorAppointment? next;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Next patient', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: scheme.onPrimaryContainer)),
            const SizedBox(height: 8),
            if (next == null)
              Text('No confirmed patients waiting today.', style: TextStyle(color: scheme.onPrimaryContainer))
            else ...[
              Text(
                '${next!.patientName} · ${formatTime(next!.scheduledAt)} · ${next!.isVideo ? 'Video' : 'Clinic'}',
                style: TextStyle(color: scheme.onPrimaryContainer),
              ),
              if (next!.consultationId != null) ...[
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => context.push('/consultation/${next!.consultationId}'),
                  child: const Text('Open consultation'),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.empty, required this.appointments});

  final String title;
  final String empty;
  final List<DoctorAppointment> appointments;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title.toUpperCase(), style: Theme.of(context).textTheme.labelMedium?.copyWith(letterSpacing: 0.8)),
        const SizedBox(height: 8),
        if (appointments.isEmpty)
          Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(empty))
        else
          for (final a in appointments) AppointmentTile(appointment: a),
      ],
    );
  }
}

class AppointmentTile extends StatelessWidget {
  const AppointmentTile({super.key, required this.appointment});

  final DoctorAppointment appointment;

  static const _actionLabel = {
    'SCHEDULED': 'Start',
    'IN_PROGRESS': 'Continue',
    'COMPLETED': 'View',
  };

  @override
  Widget build(BuildContext context) {
    final a = appointment;
    final where = a.isVideo ? 'Video' : 'Clinic${a.clinicName != null ? ' — ${a.clinicName}' : ''}';
    final canOpen = a.consultationId != null && a.consultationStatus != 'CANCELLED';
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(a.patientName),
        subtitle: Text([
          '${formatDateTime(a.scheduledAt)} · ${a.durationMinutes} min · $where',
          if (a.careRecipientName != null) 'For ${a.careRecipientName}',
          if (nonEmpty(a.reasonForVisit) != null) a.reasonForVisit!,
        ].join('\n')),
        isThreeLine: a.careRecipientName != null || nonEmpty(a.reasonForVisit) != null,
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            StatusChip(a.status),
            if (canOpen)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  _actionLabel[a.consultationStatus] ?? 'Open',
                  style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w600),
                ),
              ),
          ],
        ),
        onTap: canOpen ? () => context.push('/consultation/${a.consultationId}') : null,
      ),
    );
  }
}
