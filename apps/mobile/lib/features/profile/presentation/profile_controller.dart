import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/consent_api.dart';
import '../data/profile_api.dart';
import '../domain/consent.dart';
import '../domain/patient_profile.dart';

final profileApiProvider = Provider<ProfileApi>((ref) => ProfileApiImpl(ref.watch(apiClientProvider)));
final consentApiProvider = Provider<ConsentApi>((ref) => ConsentApiImpl(ref.watch(apiClientProvider)));

class ProfileData {
  const ProfileData({required this.profile, required this.email, required this.mobile, required this.consents});

  final PatientProfile profile;
  final String? email;
  final String mobile;
  final List<ConsentRecord> consents;
}

/// Only meaningful once signed in — depends on [authControllerProvider] so it
/// never fetches before there's a session to fetch for (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 2).
class ProfileController extends AsyncNotifier<ProfileData> {
  @override
  Future<ProfileData> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) {
      throw StateError('ProfileController read before sign-in');
    }
    return _load();
  }

  Future<ProfileData> _load() async {
    final my = await ref.read(profileApiProvider).getMyProfile();
    final consents = await ref.read(consentApiProvider).listMyConsents();
    return ProfileData(profile: my.profile, email: my.email, mobile: my.mobile, consents: consents);
  }

  Future<void> updateProfile(Map<String, dynamic> patch) async {
    await ref.read(profileApiProvider).updateMyProfile(patch);
    state = AsyncValue.data(await _load());
  }

  Future<void> addFamilyMember(Map<String, dynamic> dto) async {
    await ref.read(profileApiProvider).addFamilyMember(dto);
    state = AsyncValue.data(await _load());
  }

  Future<void> deleteFamilyMember(String id) async {
    await ref.read(profileApiProvider).deleteFamilyMember(id);
    state = AsyncValue.data(await _load());
  }

  Future<void> withdrawConsent(String artifactId) async {
    await ref.read(consentApiProvider).withdraw(artifactId);
    state = AsyncValue.data(await _load());
  }
}

final profileControllerProvider = AsyncNotifierProvider<ProfileController, ProfileData>(ProfileController.new);
