import '../../../core/api/api_client.dart';
import '../domain/prescription_match_item.dart';
import '../domain/prescription_summary.dart';

/// Talks to the existing `/api/v1/patients/me/prescriptions` and
/// `/api/v1/prescriptions/[id]/match` routes only — nothing here invents an
/// endpoint (docs/mobile/IMPLEMENTATION-PLAN.md Phase 7). There is
/// deliberately no `detail(id)`/`download(id)` method here — see
/// `PrescriptionSummary`'s doc comment for why (no `GET /prescriptions/
/// [id]` at all, and no document/file on the model to download).
abstract class PrescriptionsApi {
  /// `GET /api/v1/patients/me/prescriptions` — already confirmed
  /// patient-accessible (`listFinalizedPrescriptionsForPatient()`).
  Future<List<PrescriptionSummary>> myPrescriptions();

  /// `GET /api/v1/prescriptions/[id]/match?pharmacyId=` — already confirmed
  /// patient-accessible (`matchPrescriptionAtPharmacy()`).
  Future<List<PrescriptionMatchItem>> matchAtPharmacy({required String prescriptionId, required String pharmacyId});
}

class PrescriptionsApiImpl implements PrescriptionsApi {
  PrescriptionsApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<List<PrescriptionSummary>> myPrescriptions() {
    return _client.get<List<PrescriptionSummary>>(
      '/api/v1/patients/me/prescriptions',
      decode: (json) => ((json as Map<String, dynamic>)['prescriptions'] as List<dynamic>)
          .map((e) => PrescriptionSummary.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<List<PrescriptionMatchItem>> matchAtPharmacy({required String prescriptionId, required String pharmacyId}) {
    return _client.get<List<PrescriptionMatchItem>>(
      '/api/v1/prescriptions/$prescriptionId/match',
      query: {'pharmacyId': pharmacyId},
      decode: (json) => ((json as Map<String, dynamic>)['items'] as List<dynamic>)
          .map((e) => PrescriptionMatchItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
