import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../pharmacy/domain/medicine_order_creation.dart';
import '../../pharmacy/presentation/medicine_search_controller.dart';
import '../domain/prescription_match_item.dart';
import 'prescriptions_controller.dart';

enum PurchaseOutcomeKind {
  /// Nothing attempted yet, or the user changed a field since the last
  /// attempt.
  none,
  success,

  /// `bookOrder()`'s `ServiceUnavailableError` — Razorpay isn't configured
  /// in this environment (the expected state in dev right now, not a bug).
  serviceUnavailable,

  /// A fresh re-match found a previously-available item no longer available,
  /// or no longer stocked in the requested quantity — or the backend's own
  /// error if that changed in the instant between that check and the actual
  /// order call.
  conflict,

  /// A client-side validation failure caught *before* calling the backend
  /// (no pharmacy picked, no item selected, or an empty delivery address).
  validationError,

  /// Any other failure (transport, unexpected server error, etc).
  error,
}

class PurchaseOutcome {
  const PurchaseOutcome(this.kind, {this.message, this.result});

  final PurchaseOutcomeKind kind;
  final String? message;

  /// Only set on [PurchaseOutcomeKind.success].
  final MedicineOrderCreationResult? result;

  static const none = PurchaseOutcome(PurchaseOutcomeKind.none);
}

class PrescriptionPurchaseState {
  const PrescriptionPurchaseState({
    this.pharmacyId,
    this.matchItems,
    this.quantities = const {},
    this.deliveryAddress = '',
    this.careRecipientFamilyMemberId,
    this.submitting = false,
    this.matching = false,
    this.outcome = PurchaseOutcome.none,
  });

  final String? pharmacyId;

  /// Null until a pharmacy is picked; the match for that pharmacy once it
  /// is (`GET /api/v1/prescriptions/[id]/match?pharmacyId=`).
  final AsyncValue<List<PrescriptionMatchItem>>? matchItems;

  /// Chosen quantity per `prescriptionItemId`, only for items the patient
  /// has opted into (an item absent here is not part of the order).
  final Map<String, int> quantities;

  final String deliveryAddress;
  final String? careRecipientFamilyMemberId;
  final bool submitting;
  final bool matching;
  final PurchaseOutcome outcome;

  List<PrescriptionMatchItem> get selectedItems {
    final items = matchItems?.value ?? const <PrescriptionMatchItem>[];
    return items.where((i) => (quantities[i.prescriptionItemId] ?? 0) > 0).toList();
  }

  PrescriptionPurchaseState copyWith({
    String? Function()? pharmacyId,
    AsyncValue<List<PrescriptionMatchItem>>? Function()? matchItems,
    Map<String, int>? quantities,
    String? deliveryAddress,
    String? Function()? careRecipientFamilyMemberId,
    bool? submitting,
    bool? matching,
    PurchaseOutcome? outcome,
  }) {
    return PrescriptionPurchaseState(
      pharmacyId: pharmacyId != null ? pharmacyId() : this.pharmacyId,
      matchItems: matchItems != null ? matchItems() : this.matchItems,
      quantities: quantities ?? this.quantities,
      deliveryAddress: deliveryAddress ?? this.deliveryAddress,
      careRecipientFamilyMemberId:
          careRecipientFamilyMemberId != null ? careRecipientFamilyMemberId() : this.careRecipientFamilyMemberId,
      submitting: submitting ?? this.submitting,
      matching: matching ?? this.matching,
      outcome: outcome ?? this.outcome,
    );
  }
}

/// Drives "purchase from a finalized prescription" (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 7): pick a pharmacy → `matchPrescriptionAtPharmacy`
/// resolves which items that pharmacy actually stocks → the patient picks
/// quantities for the available ones → place the order.
///
/// **Not the cart** — `addToCart()` refuses any `requiresPrescription`
/// medicine outright, confirmed by reading that function directly (see
/// `PrescriptionMatchItem`'s doc comment). This controller calls
/// `PharmacyApi.bookOrder` — the genuinely separate, already
/// patient-reachable direct-order route — with this prescription's id and
/// the matched items.
///
/// **Availability discipline, adapted from Phase 4/5/6's own rule**:
/// [confirmPurchase] always re-runs the real match call immediately before
/// placing the order, and refuses to include any selected item that fresh
/// match no longer reports available (or in enough quantity) — never trusts
/// the match result the screen was built with as still accurate at the
/// moment of ordering.
class PrescriptionPurchaseController extends StateNotifier<PrescriptionPurchaseState> {
  PrescriptionPurchaseController(this._ref, this.prescriptionId) : super(const PrescriptionPurchaseState());

  final Ref _ref;
  final String prescriptionId;

  Future<void> selectPharmacy(String pharmacyId) async {
    state = state.copyWith(
      pharmacyId: () => pharmacyId,
      matchItems: () => const AsyncValue.loading(),
      quantities: const {},
      outcome: PurchaseOutcome.none,
    );
    final result = await AsyncValue.guard(
      () => _ref.read(prescriptionsApiProvider).matchAtPharmacy(prescriptionId: prescriptionId, pharmacyId: pharmacyId),
    );
    state = state.copyWith(matchItems: () => result);
  }

  void setQuantity(String prescriptionItemId, int quantity) {
    final next = Map<String, int>.from(state.quantities);
    if (quantity <= 0) {
      next.remove(prescriptionItemId);
    } else {
      next[prescriptionItemId] = quantity;
    }
    state = state.copyWith(quantities: next, outcome: PurchaseOutcome.none);
  }

  void setDeliveryAddress(String address) {
    state = state.copyWith(deliveryAddress: address, outcome: PurchaseOutcome.none);
  }

  void setCareRecipientFamilyMemberId(String? id) {
    state = state.copyWith(careRecipientFamilyMemberId: () => id, outcome: PurchaseOutcome.none);
  }

  Future<void> confirmPurchase() async {
    if (state.submitting) return;

    final pharmacyId = state.pharmacyId;
    final selected = state.selectedItems;
    final address = state.deliveryAddress.trim();

    if (pharmacyId == null) {
      state = state.copyWith(outcome: const PurchaseOutcome(PurchaseOutcomeKind.validationError, message: 'Please choose a pharmacy.'));
      return;
    }
    if (selected.isEmpty) {
      state = state.copyWith(
        outcome: const PurchaseOutcome(PurchaseOutcomeKind.validationError, message: 'Please select at least one item to order.'),
      );
      return;
    }
    if (address.isEmpty) {
      state = state.copyWith(outcome: const PurchaseOutcome(PurchaseOutcomeKind.validationError, message: 'Please enter a delivery address.'));
      return;
    }

    state = state.copyWith(submitting: true, outcome: PurchaseOutcome.none);
    final api = _ref.read(prescriptionsApiProvider);

    final fresh = await AsyncValue.guard(() => api.matchAtPharmacy(prescriptionId: prescriptionId, pharmacyId: pharmacyId));
    if (fresh.hasError) {
      state = state.copyWith(
        submitting: false,
        outcome: const PurchaseOutcome(PurchaseOutcomeKind.error, message: "Couldn't confirm this pharmacy still stocks these items. Please try again."),
      );
      return;
    }
    final freshById = {for (final item in fresh.value!) item.prescriptionItemId: item};
    for (final item in selected) {
      final freshItem = freshById[item.prescriptionItemId];
      final requestedQty = state.quantities[item.prescriptionItemId] ?? 0;
      if (freshItem == null || !freshItem.available || freshItem.quantityAvailable < requestedQty) {
        state = state.copyWith(
          submitting: false,
          outcome: PurchaseOutcome(
            PurchaseOutcomeKind.conflict,
            message: '${item.productName} is no longer available in that quantity at this pharmacy — please review your selection.',
          ),
        );
        return;
      }
    }

    try {
      final result = await _ref.read(pharmacyApiProvider).bookOrder(
            pharmacyId: pharmacyId,
            deliveryAddress: address,
            prescriptionId: prescriptionId,
            careRecipientFamilyMemberId: state.careRecipientFamilyMemberId,
            items: selected
                .map((item) => {'medicineId': item.medicineId, 'quantity': state.quantities[item.prescriptionItemId] ?? 0})
                .toList(),
          );
      state = state.copyWith(submitting: false, outcome: PurchaseOutcome(PurchaseOutcomeKind.success, result: result));
    } on ApiException catch (e) {
      if (e.statusCode == 503) {
        state = state.copyWith(submitting: false, outcome: PurchaseOutcome(PurchaseOutcomeKind.serviceUnavailable, message: e.message));
        return;
      }
      if (e.statusCode == 404 || e.statusCode == 409 || e.statusCode == 400) {
        state = state.copyWith(submitting: false, outcome: PurchaseOutcome(PurchaseOutcomeKind.conflict, message: e.message));
        return;
      }
      state = state.copyWith(submitting: false, outcome: PurchaseOutcome(PurchaseOutcomeKind.error, message: e.message));
    }
  }
}

final prescriptionPurchaseControllerProvider =
    StateNotifierProvider.family<PrescriptionPurchaseController, PrescriptionPurchaseState, String>(
  (ref, prescriptionId) => PrescriptionPurchaseController(ref, prescriptionId),
);

/// Pharmacy picker options (`GET /api/v1/public/pharmacies`) — plain
/// `FutureProvider`, same shape as every other one-shot lookup in this app.
final pharmaciesProvider = FutureProvider((ref) => ref.watch(pharmacyApiProvider).listPharmacies());
