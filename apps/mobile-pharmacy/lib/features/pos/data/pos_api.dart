import '../../../core/api/api_client.dart';
import '../domain/pos_sale.dart';

/// apps/platform-api/src/app/api/v1/pharmacies/me/pos/sales/:
/// - `GET  /pharmacies/me/pos/sales`     -> `{sales}` (route.ts, `listMySales`, newest 100)
/// - `POST /pharmacies/me/pos/sales`     -> 201 `{sale}` (route.ts, `recordSale`),
///   body `posSaleSchema`. Refuses unless the pharmacy is APPROVED, has
///   active TaxSettings, and every item's medicine has an HSN code with an
///   active `GstRateConfig`; decrements stock + writes a SALE stock
///   movement + issues an Invoice (CGST/SGST split) in one transaction.
/// - `GET  /pharmacies/me/pos/sales/:id` -> `{sale}` ([id]/route.ts, `getSale`)
///
/// No Idempotency-Key: this route doesn't implement one
/// (packages/domain/src/server/idempotency.ts is wired only into the
/// patient booking/checkout routes), so double-submit is prevented in the
/// UI instead.
abstract class PosApi {
  Future<PosSale> recordSale(PosSaleRequest request);

  Future<List<PosSale>> listSales();

  Future<PosSale> getSale(String id);
}

class PosApiImpl implements PosApi {
  PosApiImpl(this._client);

  final ApiClient _client;

  static const _path = '/api/v1/pharmacies/me/pos/sales';

  static PosSale _decodeSale(dynamic json) => PosSale.fromJson((json as Map<String, dynamic>)['sale'] as Map<String, dynamic>);

  @override
  Future<PosSale> recordSale(PosSaleRequest request) => _client.post<PosSale>(_path, body: request.toJson(), decode: _decodeSale);

  @override
  Future<List<PosSale>> listSales() {
    return _client.get<List<PosSale>>(
      _path,
      decode: (json) =>
          ((json as Map<String, dynamic>)['sales'] as List<dynamic>).whereType<Map<String, dynamic>>().map(PosSale.fromJson).toList(),
    );
  }

  @override
  Future<PosSale> getSale(String id) => _client.get<PosSale>('$_path/${Uri.encodeComponent(id)}', decode: _decodeSale);
}
