import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../../../shared/widgets/status_chip.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/doctor_profile.dart';
import 'profile_controller.dart';
import 'profile_management.dart';

/// Profile overview for `GET /api/v1/doctors/me`: details, links to
/// documents and clinics, and — for a DRAFT/REJECTED application — editing
/// and submit-for-verification. Outside DRAFT/REJECTED the details are
/// read-only, the same lock the backend and web enforce.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(profileControllerProvider);
    final session = ref.watch(authControllerProvider).valueOrNull?.user;
    listenForProfileWorkMessages(context, ref, profileControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: e is ApiException ? e.message : 'Could not load your profile.',
          onRetry: () => ref.invalidate(profileControllerProvider),
        ),
        data: (state) {
          final p = state.profile;
          String fee(int? v) => v == null ? '—' : '₹$v';
          String or(String? v) => (v == null || v.isEmpty) ? '—' : v;
          final rows = <String, String>{
            'Mobile': or(session?.mobile),
            'Email': or(session?.email),
            'Gender': or(p.gender),
            'Primary qualification': or(p.primaryQualification),
            'Highest qualification': or(p.highestQualification),
            'Graduation': or([p.graduationInstitution, p.graduationYear?.toString()].whereType<String>().join(' · ')),
            'Registration': or([p.registrationCouncil, p.registrationNumber, p.registrationYear?.toString()].whereType<String>().join(' · ')),
            'Experience': p.yearsExperience == null ? '—' : '${p.yearsExperience} years',
            'Specialties': or(p.specialties.join(', ')),
            'Languages': or(p.languages.join(', ')),
            'Consultation modes': or(p.consultationModes.join(', ')),
            'Video fee': fee(p.videoFee),
            'Clinic fee': fee(p.clinicFee),
            'Accepting new patients': p.isAcceptingNewPatients ? 'Yes' : 'No',
          };
          final flagged = p.documents.where((d) => d.needsResubmission).length;
          return Stack(
            children: [
              ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(p.displayName, style: Theme.of(context).textTheme.headlineSmall)),
                      StatusChip(p.verificationStatus),
                    ],
                  ),
                  if (p.verificationStatus == 'REJECTED' && p.rejectionReason != null) ...[
                    const SizedBox(height: 8),
                    Text('Rejected: ${p.rejectionReason}', style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ],
                  if (p.bio != null) ...[const SizedBox(height: 8), Text(p.bio!)],
                  const SizedBox(height: 12),
                  if (p.isEditableApplication)
                    FilledButton.icon(
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('Edit profile'),
                      onPressed: state.busy ? null : () => context.push('/profile/edit'),
                    )
                  else
                    const _InfoBanner(text: ProfileController.lockedMessage),
                  const SizedBox(height: 16),
                  Card(
                    child: Column(
                      children: [
                        for (final e in rows.entries) ListTile(dense: true, title: Text(e.key), subtitle: Text(e.value)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Card(
                    child: Column(
                      children: [
                        ListTile(
                          leading: const Icon(Icons.description_outlined),
                          title: const Text('Documents'),
                          subtitle: Text('${p.documentCount} on file'
                              '${flagged > 0 ? ' · $flagged flagged for resubmission' : ''}'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push('/documents'),
                        ),
                        const Divider(height: 1),
                        ListTile(
                          leading: const Icon(Icons.local_hospital_outlined),
                          title: const Text('Clinics'),
                          subtitle: Text(p.clinics.isEmpty ? 'None added' : p.clinics.map((c) => c.name).join(', ')),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push('/clinics'),
                        ),
                      ],
                    ),
                  ),
                  if (p.isEditableApplication) ...[
                    const SizedBox(height: 16),
                    _SubmitCard(profile: p, busy: state.busy),
                  ],
                  const SizedBox(height: 16),
                  Text(
                    'Changes to regulated details after submission go through ABIES support. '
                    'Earnings, care plans and hospital admissions are on the partner portal at abies.in/partner.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.logout),
                    label: const Text('Sign out'),
                    onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
                  ),
                ],
              ),
              if (state.busy) const Positioned(top: 0, left: 0, right: 0, child: LinearProgressIndicator()),
            ],
          );
        },
      ),
    );
  }
}

/// Snackbar for a [ProfileWorkState]'s one-shot `error`/`message`.
void listenForProfileWorkMessages(BuildContext context, WidgetRef ref, ProviderListenable<AsyncValue<ProfileWorkState>> provider) {
  ref.listen(provider, (prev, next) {
    final before = prev?.valueOrNull;
    final after = next.valueOrNull;
    if (after == null) return;
    final text = after.error ?? after.message;
    if (text == null) return;
    if (identical(before, after)) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  });
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: scheme.secondaryContainer, borderRadius: BorderRadius.circular(12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.lock_outline, size: 20, color: scheme.onSecondaryContainer),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(color: scheme.onSecondaryContainer))),
        ],
      ),
    );
  }
}

class _SubmitCard extends ConsumerStatefulWidget {
  const _SubmitCard({required this.profile, required this.busy});

  final DoctorProfile profile;
  final bool busy;

  @override
  ConsumerState<_SubmitCard> createState() => _SubmitCardState();
}

class _SubmitCardState extends ConsumerState<_SubmitCard> {
  bool _declared = false;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Submit for verification', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('Application completeness: ${widget.profile.completion}%'),
            const SizedBox(height: 6),
            LinearProgressIndicator(value: widget.profile.completion / 100),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _declared,
              onChanged: widget.busy ? null : (v) => setState(() => _declared = v ?? false),
              title: const Text(
                'I declare that the information and documents provided are accurate and that I am authorised '
                'to practise under the stated registration.',
              ),
            ),
            FilledButton(
              onPressed: !_declared || widget.busy
                  ? null
                  : () => ref.read(profileControllerProvider.notifier).submit(declarationAccepted: _declared),
              child: const Text('Submit application'),
            ),
          ],
        ),
      ),
    );
  }
}
