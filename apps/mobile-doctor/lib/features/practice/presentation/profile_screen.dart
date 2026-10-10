import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../../../shared/widgets/status_chip.dart';
import '../../auth/presentation/auth_controller.dart';
import 'dashboard_controller.dart';

/// Read-only view of `GET /api/v1/doctors/me`. Editing is deliberately not
/// offered here: the backend locks profile edits once a doctor is
/// SUBMITTED/UNDER_REVIEW/APPROVED (doctors.service.ts `updateMe`), and the
/// DRAFT-stage application (profile + document uploads) lives on the web
/// partner portal for this pass.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardControllerProvider);
    final session = ref.watch(authControllerProvider).valueOrNull?.user;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: e is ApiException ? e.message : 'Could not load your profile.',
          onRetry: () => ref.invalidate(dashboardControllerProvider),
        ),
        data: (data) {
          final p = data.profile;
          String fee(int? v) => v == null ? '—' : '₹$v';
          final rows = <String, String>{
            'Mobile': session?.mobile ?? '—',
            'Email': session?.email ?? '—',
            'Qualification': p.primaryQualification ?? '—',
            'Registration': [p.registrationCouncil, p.registrationNumber].whereType<String>().join(' · ').ifEmpty('—'),
            'Experience': p.yearsExperience == null ? '—' : '${p.yearsExperience} years',
            'Specialties': p.specialties.join(', ').ifEmpty('—'),
            'Languages': p.languages.join(', ').ifEmpty('—'),
            'Consultation modes': p.consultationModes.join(', ').ifEmpty('—'),
            'Video fee': fee(p.videoFee),
            'Clinic fee': fee(p.clinicFee),
            'Accepting new patients': p.isAcceptingNewPatients ? 'Yes' : 'No',
            'Documents on file': '${p.documentCount}',
          };
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  Expanded(child: Text(p.displayName, style: Theme.of(context).textTheme.headlineSmall)),
                  StatusChip(p.verificationStatus),
                ],
              ),
              if (p.bio != null) ...[const SizedBox(height: 8), Text(p.bio!)],
              const SizedBox(height: 16),
              Card(
                child: Column(
                  children: [
                    for (final e in rows.entries) ListTile(dense: true, title: Text(e.key), subtitle: Text(e.value)),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Text('Clinics', style: Theme.of(context).textTheme.titleMedium),
              if (p.clinics.isEmpty) const Text('No clinics added.'),
              for (final c in p.clinics)
                Card(
                  child: ListTile(
                    title: Text(c.name),
                    subtitle: Text('${c.addressLine1}, ${c.city}, ${c.state}${c.active ? '' : ' · inactive'}'),
                  ),
                ),
              const SizedBox(height: 16),
              Text(
                'To change regulated profile details, contact ABIES support. Draft applications are completed on the partner portal at abies.in/partner.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                icon: const Icon(Icons.logout),
                label: const Text('Sign out'),
                onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
              ),
            ],
          );
        },
      ),
    );
  }
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}
