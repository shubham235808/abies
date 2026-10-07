import 'package:abies_mobile/core/api/api_exception.dart';
import 'package:abies_mobile/features/panchakarma/data/panchakarma_api.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_booking_creation.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_booking_detail.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_centre.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_facets.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_search_result.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_therapy.dart';
import 'package:abies_mobile/features/panchakarma/presentation/panchakarma_booking_flow_controller.dart';
import 'package:abies_mobile/features/panchakarma/presentation/panchakarma_search_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakePanchakarmaApi implements PanchakarmaApi {
  /// What the re-fetch-before-booking search call returns. Null means "the
  /// same therapy the controller was constructed with".
  List<PanchakarmaTherapy>? refetchTherapies;
  int searchCallCount = 0;

  Object? bookError;
  PanchakarmaBookingCreationResult? bookResultValue;
  int bookCallCount = 0;

  @override
  Future<PanchakarmaSearchResult> search({String? q, String? city, int limit = 20, int offset = 0}) async {
    searchCallCount += 1;
    return PanchakarmaSearchResult(total: refetchTherapies?.length ?? 0, therapies: refetchTherapies ?? const []);
  }

  @override
  Future<PanchakarmaBookingCreationResult> book({required String centreId, required String therapyId, required int sessionCount}) async {
    bookCallCount += 1;
    if (bookError != null) throw bookError!;
    return bookResultValue!;
  }

  @override
  Future<PanchakarmaFacets> facets() => throw UnimplementedError('not used in these tests');

  @override
  Future<List<PanchakarmaCentre>> centres({String? city}) => throw UnimplementedError('not used in these tests');

  @override
  Future<PanchakarmaBookingDetail> verifyPayment({
    required String bookingId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<PanchakarmaBookingDetail> cancel(String bookingId, {String? reason}) => throw UnimplementedError('not used in these tests');

  @override
  Future<PanchakarmaBookingDetail> detail(String bookingId) => throw UnimplementedError('not used in these tests');

  @override
  Future<List<PanchakarmaBookingDetail>> mine() => throw UnimplementedError('not used in these tests');
}

final _therapy = PanchakarmaTherapy.fromJson({
  'id': 't1',
  'name': 'Abhyanga',
  'description': null,
  'durationMinutes': 60,
  'prerequisites': null,
  'contraindications': null,
  'price': 1500,
  'requiredSupervision': false,
  'centre': {'id': 'c1', 'name': 'Wellness Centre', 'city': 'Pune', 'state': 'MH'},
});

void main() {
  group('PanchakarmaBookingFlowController', () {
    test('starts with a session count of 1 and no outcome', () {
      final api = _FakePanchakarmaApi();
      final container = ProviderContainer(overrides: [panchakarmaApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);

      final state = container.read(panchakarmaBookingFlowControllerProvider(_therapy));

      expect(state.sessionCount, 1);
      expect(state.outcome.kind, PanchakarmaBookOutcomeKind.none);
    });

    test('setSessionCount clamps to [1, 60] and clears any previous outcome', () {
      final api = _FakePanchakarmaApi();
      final container = ProviderContainer(overrides: [panchakarmaApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(panchakarmaBookingFlowControllerProvider(_therapy).notifier);

      notifier.setSessionCount(5);
      expect(container.read(panchakarmaBookingFlowControllerProvider(_therapy)).sessionCount, 5);

      notifier.setSessionCount(0);
      expect(container.read(panchakarmaBookingFlowControllerProvider(_therapy)).sessionCount, 5, reason: 'out-of-range values are ignored');

      notifier.setSessionCount(61);
      expect(container.read(panchakarmaBookingFlowControllerProvider(_therapy)).sessionCount, 5);
    });

    test('confirmBooking re-verifies the therapy via search before booking, and books when still offered', () async {
      final api = _FakePanchakarmaApi()
        ..refetchTherapies = [_therapy]
        ..bookResultValue = const PanchakarmaBookingCreationResult(
          bookingId: 'b1',
          bookingStatus: 'BOOKED',
          amount: 1500,
          currency: 'INR',
          razorpayOrderId: 'order_1',
          razorpayKeyId: 'rzp_test',
        );
      final container = ProviderContainer(overrides: [panchakarmaApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(panchakarmaBookingFlowControllerProvider(_therapy).notifier);

      await notifier.confirmBooking();

      expect(api.searchCallCount, 1, reason: 'one real re-fetch right before booking');
      expect(api.bookCallCount, 1);
      final state = container.read(panchakarmaBookingFlowControllerProvider(_therapy));
      expect(state.outcome.kind, PanchakarmaBookOutcomeKind.success);
      expect(state.outcome.result!.bookingId, 'b1');
      expect(state.submitting, isFalse);
    });

    test('confirmBooking refuses to book a therapy missing from the fresh re-fetch, and never calls book()', () async {
      final api = _FakePanchakarmaApi()..refetchTherapies = []; // no longer offered
      final container = ProviderContainer(overrides: [panchakarmaApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(panchakarmaBookingFlowControllerProvider(_therapy).notifier);

      await notifier.confirmBooking();

      expect(api.bookCallCount, 0, reason: 'never calls book() for a therapy the fresh re-fetch no longer lists');
      final state = container.read(panchakarmaBookingFlowControllerProvider(_therapy));
      expect(state.outcome.kind, PanchakarmaBookOutcomeKind.conflict);
    });

    test('confirmBooking surfaces a 503 from book() as serviceUnavailable, not a generic error', () async {
      final api = _FakePanchakarmaApi()
        ..refetchTherapies = [_therapy]
        ..bookError = const ApiException(
          message: 'Online payments are not configured in this environment yet — booking is unavailable.',
          statusCode: 503,
        );
      final container = ProviderContainer(overrides: [panchakarmaApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(panchakarmaBookingFlowControllerProvider(_therapy).notifier);

      await notifier.confirmBooking();

      final state = container.read(panchakarmaBookingFlowControllerProvider(_therapy));
      expect(state.outcome.kind, PanchakarmaBookOutcomeKind.serviceUnavailable);
      expect(state.outcome.message, contains('not configured'));
      expect(state.submitting, isFalse);
    });

    test('confirmBooking surfaces a 404 from book() as a conflict', () async {
      final api = _FakePanchakarmaApi()
        ..refetchTherapies = [_therapy]
        ..bookError = const ApiException(message: 'Therapy not found at this centre', statusCode: 404);
      final container = ProviderContainer(overrides: [panchakarmaApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(panchakarmaBookingFlowControllerProvider(_therapy).notifier);

      await notifier.confirmBooking();

      final state = container.read(panchakarmaBookingFlowControllerProvider(_therapy));
      expect(state.outcome.kind, PanchakarmaBookOutcomeKind.conflict);
    });
  });
}
