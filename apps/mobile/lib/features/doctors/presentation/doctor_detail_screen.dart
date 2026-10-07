import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../domain/doctor_detail.dart';
import '../domain/doctor_review.dart';
import 'doctor_detail_controller.dart';
import 'doctors_controller.dart';

const _dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/// The real doctor profile/detail screen (docs/mobile/IMPLEMENTATION-PLAN.md
/// Phase 4), replacing `app_router.dart`'s Phase 1 placeholder. Reached
/// either from the search screen (a known-good slug) or directly via
/// `/doctor/:slug` as a deep link — either way this screen itself is what
/// does the "resolve against the real API before showing anything"
/// (docs/mobile/API-GAP-ANALYSIS.md §7): a slug that 404s gets a clean
/// not-found state, never a blank screen or a crash.
class DoctorDetailScreen extends ConsumerWidget {
  const DoctorDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(doctorDetailProvider(slug));
    return Scaffold(
      appBar: AppBar(title: const Text('Doctor')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) {
          if (error is ApiException && error.statusCode == 404) {
            // Resolved against the real API and genuinely doesn't exist (or
            // isn't currently discoverable) — a clean, explicit state, never
            // a blank screen (API-GAP-ANALYSIS.md §7).
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.person_search_outlined, size: 48),
                    const SizedBox(height: 12),
                    const Text("This doctor isn't available right now.", textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: () => context.go('/'), child: const Text('Back to home')),
                  ],
                ),
              ),
            );
          }
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.error_outline, size: 48, color: Theme.of(context).colorScheme.error),
                  const SizedBox(height: 12),
                  Text(error is ApiException ? error.message : 'Could not load this doctor.', textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  OutlinedButton(onPressed: () => ref.invalidate(doctorDetailProvider(slug)), child: const Text('Try again')),
                ],
              ),
            ),
          );
        },
        data: (data) => _DoctorDetailBody(doctor: data.doctor, reviews: data.reviews),
      ),
    );
  }
}

class _DoctorDetailBody extends ConsumerWidget {
  const _DoctorDetailBody({required this.doctor, required this.reviews});

  final DoctorDetail doctor;
  final List<DoctorReview> reviews;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final photoUrl = ref.read(doctorsApiProvider).absolutePhotoUrl(doctor.photoUrl);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipOval(
              child: photoUrl != null
                  ? Image.network(
                      photoUrl,
                      width: 72,
                      height: 72,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const CircleAvatar(radius: 36, child: Icon(Icons.person)),
                      loadingBuilder: (context, child, progress) =>
                          progress == null ? child : const SizedBox(width: 72, height: 72, child: LoadingSkeleton(height: 72, width: 72)),
                    )
                  : const CircleAvatar(radius: 36, child: Icon(Icons.person)),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(doctor.name, style: Theme.of(context).textTheme.headlineSmall),
                  if (doctor.primaryQualification != null) Text(doctor.primaryQualification!),
                  if (doctor.yearsExperience != null) Text('${doctor.yearsExperience} years experience'),
                  if (doctor.rating > 0) Text('★ ${doctor.rating.toStringAsFixed(1)} (${doctor.reviewCount} reviews)'),
                  if (!doctor.acceptingNewPatients)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text('Not currently accepting new patients', style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ),
                ],
              ),
            ),
          ],
        ),
        if (doctor.bio != null && doctor.bio!.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(doctor.bio!),
        ],
        const SizedBox(height: 16),
        if (doctor.specialties.isNotEmpty) _ChipSection(title: 'Specialties', values: doctor.specialties),
        if (doctor.languages.isNotEmpty) _ChipSection(title: 'Languages', values: doctor.languages),
        const SizedBox(height: 16),
        Text('Consultation', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        ...doctor.consultationModes.map((mode) {
          final fee = doctor.feeFor(mode);
          return Card(
            child: ListTile(
              leading: Icon(mode == 'VIDEO' ? Icons.videocam_outlined : Icons.local_hospital_outlined),
              title: Text(mode == 'VIDEO' ? 'Video consultation' : 'Clinic visit'),
              subtitle: Text(fee != null ? 'Fee: ₹$fee' : 'Fee not set yet'),
              trailing: FilledButton(
                onPressed: fee == null || !doctor.acceptingNewPatients
                    ? null
                    : () => context.push('/doctor/${doctor.slug}/book', extra: {'mode': mode}),
                child: const Text('Book'),
              ),
            ),
          );
        }),
        if (doctor.clinics.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('Clinics', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...doctor.clinics.map((c) => Card(
                child: ListTile(
                  leading: const Icon(Icons.location_on_outlined),
                  title: Text(c.name),
                  subtitle: Text(c.fullAddress),
                ),
              )),
        ],
        if (doctor.availability.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('Weekly availability', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...doctor.availability.map((a) => ListTile(
                dense: true,
                leading: Icon(a.mode == 'VIDEO' ? Icons.videocam_outlined : Icons.local_hospital_outlined),
                title: Text(_dayNames[a.dayOfWeek]),
                subtitle: Text('${a.startTime} – ${a.endTime}'),
              )),
        ],
        const SizedBox(height: 16),
        Text('Reviews (${reviews.length})', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (reviews.isEmpty)
          const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('No reviews yet.'))
        else
          ...reviews.map((r) => Card(
                child: ListTile(
                  title: Text(r.authorName),
                  subtitle: Text(r.comment ?? ''),
                  trailing: Text('★ ${r.rating}'),
                ),
              )),
      ],
    );
  }
}

class _ChipSection extends StatelessWidget {
  const _ChipSection({required this.title, required this.values});

  final String title;
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 4),
          Wrap(spacing: 8, runSpacing: 4, children: values.map((v) => Chip(label: Text(v))).toList()),
        ],
      ),
    );
  }
}
