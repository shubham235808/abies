import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../domain/lab_order.dart';

/// Lab-side diagnostic order routes — every one confirmed to exist in
/// apps/platform-api/src/app/api/v1/:
/// - `GET  labs/me/orders`                          (requireRole LAB)
/// - `GET  diagnostic-orders/:id`                   (requireRole PATIENT|LAB; owner-checked in getOrder)
/// - `POST labs/me/orders/:id/sample-collected`     (`sampleCollectedSchema`)
/// - `POST labs/me/orders/:id/processing`           (no body)
/// - `POST labs/me/orders/:id/report`               (multipart: criticalFlag, file?, structuredResults?)
abstract class LabOrdersApi {
  Future<List<LabOrderSummary>> listOrders();

  Future<LabOrderDetail> getOrder(String orderId);

  Future<void> markSampleCollected(String orderId, {String? collectorName, String? sampleBarcode, String? qualityException});

  Future<void> markProcessing(String orderId);

  Future<void> releaseReport(String orderId, {required bool criticalFlag, ReportUpload? file});
}

class LabOrdersApiImpl implements LabOrdersApi {
  LabOrdersApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<List<LabOrderSummary>> listOrders() {
    return _client.get<List<LabOrderSummary>>(
      '/api/v1/labs/me/orders',
      decode: (json) => ((json as Map<String, dynamic>)['orders'] as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(LabOrderSummary.fromJson)
          .toList(),
    );
  }

  @override
  Future<LabOrderDetail> getOrder(String orderId) {
    return _client.get<LabOrderDetail>(
      '/api/v1/diagnostic-orders/$orderId',
      decode: (json) => LabOrderDetail.fromJson((json as Map<String, dynamic>)['order'] as Map<String, dynamic>),
    );
  }

  @override
  Future<void> markSampleCollected(String orderId, {String? collectorName, String? sampleBarcode, String? qualityException}) {
    String? clean(String? v) => (v == null || v.trim().isEmpty) ? null : v.trim();
    return _client.post<void>(
      '/api/v1/labs/me/orders/$orderId/sample-collected',
      body: {
        if (clean(collectorName) != null) 'collectorName': clean(collectorName),
        if (clean(sampleBarcode) != null) 'sampleBarcode': clean(sampleBarcode),
        if (clean(qualityException) != null) 'qualityException': clean(qualityException),
      },
      decode: (_) {},
    );
  }

  @override
  Future<void> markProcessing(String orderId) {
    return _client.post<void>('/api/v1/labs/me/orders/$orderId/processing', body: const <String, dynamic>{}, decode: (_) {});
  }

  @override
  Future<void> releaseReport(String orderId, {required bool criticalFlag, ReportUpload? file}) async {
    // Read the file before building the form so a missing file fails here,
    // not mid-request.
    final upload = file == null
        ? null
        : await MultipartFile.fromFile(file.path, filename: file.filename, contentType: DioMediaType.parse(file.mimeType));
    return _client.postMultipart<void>(
      '/api/v1/labs/me/orders/$orderId/report',
      buildForm: () => FormData.fromMap({
        // The route compares `formData.get('criticalFlag') === 'true'`.
        'criticalFlag': criticalFlag ? 'true' : 'false',
        if (upload != null) 'file': upload,
      }),
      decode: (_) {},
    );
  }
}
