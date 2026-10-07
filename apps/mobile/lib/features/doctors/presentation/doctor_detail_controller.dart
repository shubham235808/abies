import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'doctors_controller.dart';
import '../domain/doctor_detail.dart';
import '../domain/doctor_review.dart';

/// Bundles the detail screen's two independent reads — doesn't need
/// `AsyncNotifier`'s mutation machinery (nothing on this screen writes),
/// so a plain `FutureProvider.family` keyed by slug is enough;
/// `ref.invalidate(doctorDetailProvider(slug))` is this screen's retry.
class DoctorDetailData {
  const DoctorDetailData({required this.doctor, required this.reviews});

  final DoctorDetail doctor;
  final List<DoctorReview> reviews;
}

final doctorDetailProvider = FutureProvider.family<DoctorDetailData, String>((ref, slug) async {
  final api = ref.watch(doctorsApiProvider);
  // Sequential, not parallel: a slug that 404s on the detail call should
  // never also fire a reviews request for a doctor that doesn't resolve
  // (docs/mobile/API-GAP-ANALYSIS.md §7 — resolve against the real API
  // before doing anything else with a slug).
  final doctor = await api.detail(slug);
  final reviews = await api.reviews(slug);
  return DoctorDetailData(doctor: doctor, reviews: reviews);
});
