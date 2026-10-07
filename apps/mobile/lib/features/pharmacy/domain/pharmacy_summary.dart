/// One entry of `GET /api/v1/public/pharmacies`'s `pharmacies[]`
/// (`listApprovedPharmacies()` in `packages/domain/src/modules/medicines/
/// pharmacies.service.ts`) — `{ id, name, serviceAreas }` only, read directly
/// from that function's own `select`. That function's own doc comment says
/// its real purpose is powering the pharmacy-picker in the
/// "order from a finalized prescription" flow — used here for exactly that
/// (`lib/features/prescriptions/presentation/prescription_purchase_*`), and
/// also as the embedded `pharmacy` on a [MedicineSummary]/cart's own
/// `pharmacy` field.
///
/// **No single-pharmacy detail route** (`GET /public/pharmacies/[id]`
/// doesn't exist — same already-known gap as medicines/Panchakarma/
/// Diagnostics). A pharmacy detail screen takes this object via `extra`.
class PharmacySummary {
  const PharmacySummary({required this.id, required this.name, required this.serviceAreas});

  final String id;
  final String? name;
  final List<String> serviceAreas;

  factory PharmacySummary.fromJson(Map<String, dynamic> json) {
    return PharmacySummary(
      id: json['id'] as String,
      name: json['name'] as String?,
      serviceAreas: (json['serviceAreas'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
    );
  }
}
