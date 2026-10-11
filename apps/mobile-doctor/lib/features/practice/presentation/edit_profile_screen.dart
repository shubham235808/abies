import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/form_bits.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/doctor_profile.dart';
import '../domain/profile_inputs.dart';
import 'profile_controller.dart';

/// Edit form for `PATCH /api/v1/doctors/me` — same fields as the web
/// ProfileForm. Only reachable for a DRAFT/REJECTED application; if the
/// status changed underneath (e.g. submitted from the web), the form is
/// shown read-only with the lock message instead.
class EditProfileScreen extends ConsumerWidget {
  const EditProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(profileControllerProvider);
    // No snackbar listener here: the Profile screen underneath shares this
    // controller and already shows one; errors also render inline below.
    return Scaffold(
      appBar: AppBar(title: const Text('Edit profile')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(
          message: e is ApiException ? e.message : 'Could not load your profile.',
          onRetry: () => ref.invalidate(profileControllerProvider),
        ),
        // Keyed on the profile id so the form's text controllers are seeded
        // once from the loaded profile, not reset by every busy/error state.
        data: (state) => _ProfileForm(key: ValueKey(state.profile.id), initial: state.profile),
      ),
    );
  }
}

class _ProfileForm extends ConsumerStatefulWidget {
  const _ProfileForm({super.key, required this.initial});

  final DoctorProfile initial;

  @override
  ConsumerState<_ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends ConsumerState<_ProfileForm> {
  late final ProfileFormInput _seed = ProfileFormInput.fromProfile(widget.initial);
  late final Map<String, TextEditingController> _c = {
    'title': TextEditingController(text: _seed.title),
    'firstName': TextEditingController(text: _seed.firstName),
    'lastName': TextEditingController(text: _seed.lastName),
    'gender': TextEditingController(text: _seed.gender),
    'bio': TextEditingController(text: _seed.bio),
    'registrationCouncil': TextEditingController(text: _seed.registrationCouncil),
    'registrationNumber': TextEditingController(text: _seed.registrationNumber),
    'registrationYear': TextEditingController(text: _seed.registrationYear),
    'primaryQualification': TextEditingController(text: _seed.primaryQualification),
    'highestQualification': TextEditingController(text: _seed.highestQualification),
    'graduationInstitution': TextEditingController(text: _seed.graduationInstitution),
    'graduationYear': TextEditingController(text: _seed.graduationYear),
    'yearsExperience': TextEditingController(text: _seed.yearsExperience),
    'specialties': TextEditingController(text: _seed.specialties),
    'languages': TextEditingController(text: _seed.languages),
    'videoFee': TextEditingController(text: _seed.videoFee),
    'clinicFee': TextEditingController(text: _seed.clinicFee),
  };
  late bool _video = _seed.video;
  late bool _clinic = _seed.clinic;

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  ProfileFormInput _input() => ProfileFormInput(
        title: _c['title']!.text,
        firstName: _c['firstName']!.text,
        lastName: _c['lastName']!.text,
        gender: _c['gender']!.text,
        bio: _c['bio']!.text,
        registrationCouncil: _c['registrationCouncil']!.text,
        registrationNumber: _c['registrationNumber']!.text,
        registrationYear: _c['registrationYear']!.text,
        primaryQualification: _c['primaryQualification']!.text,
        highestQualification: _c['highestQualification']!.text,
        graduationInstitution: _c['graduationInstitution']!.text,
        graduationYear: _c['graduationYear']!.text,
        yearsExperience: _c['yearsExperience']!.text,
        specialties: _c['specialties']!.text,
        languages: _c['languages']!.text,
        video: _video,
        clinic: _clinic,
        videoFee: _c['videoFee']!.text,
        clinicFee: _c['clinicFee']!.text,
      );

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    final ok = await ref.read(profileControllerProvider.notifier).save(_input());
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(profileControllerProvider).valueOrNull;
    final editable = state?.profile.isEditableApplication ?? false;
    final busy = state?.busy ?? false;
    final errors = state?.fieldErrors ?? const <String, String>{};

    Widget field(String key, String label, {String? hint, bool number = false, int maxLines = 1}) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextField(
            controller: _c[key],
            enabled: editable && !busy,
            maxLines: maxLines,
            keyboardType: number ? TextInputType.number : (maxLines > 1 ? TextInputType.multiline : TextInputType.text),
            inputFormatters: number ? [FilteringTextInputFormatter.digitsOnly] : null,
            decoration: InputDecoration(labelText: label, hintText: hint, errorText: errors[key]),
          ),
        );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (!editable) ...[
          Text(ProfileController.lockedMessage, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          const SizedBox(height: 12),
        ] else if (widget.initial.verificationStatus == 'REJECTED') ...[
          Text('Saving changes moves your application back to Draft so you can resubmit it.',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
        ],
        Text('About you', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        field('title', 'Title', hint: 'Dr.'),
        field('firstName', 'First name'),
        field('lastName', 'Last name'),
        field('gender', 'Gender (optional)'),
        field('bio', 'Bio', maxLines: 4),
        const SizedBox(height: 4),
        Text('Registration', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        field('registrationCouncil', 'Registration council'),
        field('registrationNumber', 'Registration number'),
        field('registrationYear', 'Registration year', number: true),
        const SizedBox(height: 4),
        Text('Qualifications & experience', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        field('primaryQualification', 'Primary qualification', hint: 'BAMS'),
        field('highestQualification', 'Highest qualification', hint: 'MD (Ayurveda)'),
        field('graduationInstitution', 'Graduation institution'),
        field('graduationYear', 'Graduation year', number: true),
        field('yearsExperience', 'Years of experience', number: true),
        field('specialties', 'Specialties (comma-separated)', hint: 'Panchakarma, Digestive Health'),
        field('languages', 'Languages (comma-separated)', hint: 'English, Hindi'),
        const SizedBox(height: 4),
        Text('Consultation modes', style: Theme.of(context).textTheme.titleMedium),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Video'),
          value: _video,
          onChanged: editable && !busy ? (v) => setState(() => _video = v) : null,
        ),
        if (_video) field('videoFee', 'Video fee (₹)', number: true),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Clinic'),
          value: _clinic,
          onChanged: editable && !busy ? (v) => setState(() => _clinic = v) : null,
        ),
        if (_clinic) field('clinicFee', 'Clinic fee (₹)', number: true),
        FormErrorText(state?.error),
        const SizedBox(height: 16),
        if (editable) BusyFilledButton(busy: busy, onPressed: _save, label: 'Save profile'),
      ],
    );
  }
}
