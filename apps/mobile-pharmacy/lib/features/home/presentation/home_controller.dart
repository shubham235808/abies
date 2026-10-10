import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/pharmacy_profile_api.dart';
import '../domain/pharmacy_profile.dart';

final pharmacyProfileApiProvider = Provider<PharmacyProfileApi>((ref) => PharmacyProfileApiImpl(ref.watch(apiClientProvider)));

/// The signed-in pharmacy's own profile — drives the verification banner on
/// the dashboard (an unapproved pharmacy receives no orders yet).
final pharmacyProfileProvider = FutureProvider<PharmacyProfile>((ref) async {
  final auth = await ref.watch(authControllerProvider.future);
  if (!auth.isSignedIn) throw StateError('pharmacyProfileProvider read before sign-in');
  return ref.watch(pharmacyProfileApiProvider).me();
});
