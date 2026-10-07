/// One row of `GET /api/v1/public/panchakarma-centres`'s `centres[]`
/// (`listApprovedCentres()` in `packages/domain/src/modules/panchakarma/
/// centres.service.ts`) — deliberately thin: that function's own `select`
/// only reads `{ id, name, city, state }`, nothing else (confirmed by
/// reading the real code, not assumed from `PanchakarmaTherapy.centre`'s
/// richer-looking shape, which happens to carry the same four fields from a
/// different query).
///
/// **There is no public single-centre detail route** (confirmed — no
/// `/public/panchakarma-centres/[id]` exists). This list is therefore a
/// browse-only view with nothing to tap into; see `PHASE.md` for this real
/// gap, reported rather than worked around with a client-side filter that
/// would only *look* like a detail screen.
class PanchakarmaCentre {
  const PanchakarmaCentre({required this.id, required this.name, required this.city, required this.state});

  final String id;
  final String? name;
  final String? city;
  final String? state;

  factory PanchakarmaCentre.fromJson(Map<String, dynamic> json) {
    return PanchakarmaCentre(
      id: json['id'] as String,
      name: json['name'] as String?,
      city: json['city'] as String?,
      state: json['state'] as String?,
    );
  }
}
