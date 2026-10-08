import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../domain/cart.dart';
import '../domain/medicine_order_creation.dart';
import 'medicine_search_controller.dart';

enum CheckoutOutcomeKind {
  /// Nothing attempted yet, or the user changed a field since the last
  /// attempt.
  none,
  success,

  /// `bookOrder()`'s (via `checkoutCart()`) `ServiceUnavailableError` —
  /// Razorpay isn't configured in this environment (the expected state in
  /// dev right now, not a bug).
  serviceUnavailable,

  /// This cart's own re-fetch-before-checkout check found it empty, gone, or
  /// carrying an item this pharmacy no longer has enough stock of — or the
  /// backend's own error if that changed in the instant between that check
  /// and the actual checkout call.
  conflict,

  /// A client-side validation failure caught *before* calling the backend
  /// (empty delivery address) — enforced here so an invalid request is
  /// never even sent, not just relied on the backend's own 400.
  validationError,

  /// Any other failure (transport, unexpected server error, etc).
  error,
}

class CheckoutOutcome {
  const CheckoutOutcome(this.kind, {this.message, this.result});

  final CheckoutOutcomeKind kind;
  final String? message;

  /// Only set on [CheckoutOutcomeKind.success].
  final MedicineOrderCreationResult? result;

  static const none = CheckoutOutcome(CheckoutOutcomeKind.none);
}

class CheckoutState {
  const CheckoutState({this.deliveryAddress = '', this.careRecipientFamilyMemberId, this.submitting = false, this.outcome = CheckoutOutcome.none});

  final String deliveryAddress;
  final String? careRecipientFamilyMemberId;
  final bool submitting;
  final CheckoutOutcome outcome;

  CheckoutState copyWith({
    String? deliveryAddress,
    String? Function()? careRecipientFamilyMemberId,
    bool? submitting,
    CheckoutOutcome? outcome,
  }) {
    return CheckoutState(
      deliveryAddress: deliveryAddress ?? this.deliveryAddress,
      careRecipientFamilyMemberId: careRecipientFamilyMemberId != null ? careRecipientFamilyMemberId() : this.careRecipientFamilyMemberId,
      submitting: submitting ?? this.submitting,
      outcome: outcome ?? this.outcome,
    );
  }
}

/// Drives the delivery-address → checkout → payment-or-unavailable step for
/// one cart, keyed by its `cartId` (docs/mobile/IMPLEMENTATION-PLAN.md
/// Phase 7) — structurally the same wizard shape as Phase 4/5/6's booking
/// controllers.
///
/// **Availability discipline, adapted from Phase 4/5/6's own rule** (brief
/// §7, applied here to "is this still in stock" rather than "is this still
/// offered" since a cart — unlike a test/package/therapy — *is* its own
/// re-checkable resource): [confirmCheckout] always re-fetches every active
/// cart (`PharmacyApi.myCarts()` — there is no single-cart `GET`) immediately
/// before calling `/checkout`, and refuses to check out a cart that fresh
/// fetch no longer lists, lists empty, or lists with any item now
/// `available: false` (a live stock/price check the backend itself exposes
/// on every cart read — see `CartItem`'s doc comment) — never trusts the
/// cart object a screen was built with as still accurate at the moment of
/// payment.
class CheckoutFlowController extends StateNotifier<CheckoutState> {
  CheckoutFlowController(this._ref, this.cartId) : super(const CheckoutState());

  final Ref _ref;
  final String cartId;

  // One key per distinct checkout request (docs/mobile/IMPLEMENTATION-PLAN.md
  // Phase 8) — reused across confirmCheckout()'s own retries, regenerated
  // whenever the address/recipient actually change.
  String _idempotencyKey = ApiClient.newIdempotencyKey();

  void setDeliveryAddress(String address) {
    if (address == state.deliveryAddress) return;
    _idempotencyKey = ApiClient.newIdempotencyKey();
    state = state.copyWith(deliveryAddress: address, outcome: CheckoutOutcome.none);
  }

  void setCareRecipientFamilyMemberId(String? id) {
    if (id == state.careRecipientFamilyMemberId) return;
    _idempotencyKey = ApiClient.newIdempotencyKey();
    state = state.copyWith(careRecipientFamilyMemberId: () => id, outcome: CheckoutOutcome.none);
  }

  Future<void> confirmCheckout() async {
    if (state.submitting) return;

    final address = state.deliveryAddress.trim();
    if (address.isEmpty) {
      state = state.copyWith(outcome: const CheckoutOutcome(CheckoutOutcomeKind.validationError, message: 'Please enter a delivery address.'));
      return;
    }

    state = state.copyWith(submitting: true, outcome: CheckoutOutcome.none);
    final api = _ref.read(pharmacyApiProvider);

    final freshCarts = await AsyncValue.guard(api.myCarts);
    if (freshCarts.hasError) {
      state = state.copyWith(
        submitting: false,
        outcome: const CheckoutOutcome(CheckoutOutcomeKind.error, message: "Couldn't confirm your cart is still current. Please try again."),
      );
      return;
    }
    Cart? freshCart;
    for (final c in freshCarts.value!) {
      if (c.id == cartId) {
        freshCart = c;
        break;
      }
    }
    if (freshCart == null || freshCart.items.isEmpty) {
      state = state.copyWith(
        submitting: false,
        outcome: const CheckoutOutcome(CheckoutOutcomeKind.conflict, message: 'This cart is empty or no longer exists — please go back to your cart.'),
      );
      return;
    }
    if (freshCart.hasUnavailableItems) {
      state = state.copyWith(
        submitting: false,
        outcome: const CheckoutOutcome(
          CheckoutOutcomeKind.conflict,
          message: 'One or more items in this cart are no longer available at this quantity — please review your cart.',
        ),
      );
      return;
    }

    try {
      final result = await api.checkoutCart(
        cartId: cartId,
        deliveryAddress: address,
        careRecipientFamilyMemberId: state.careRecipientFamilyMemberId,
        idempotencyKey: _idempotencyKey,
      );
      state = state.copyWith(submitting: false, outcome: CheckoutOutcome(CheckoutOutcomeKind.success, result: result));
    } on ApiException catch (e) {
      if (e.statusCode == 503) {
        state = state.copyWith(submitting: false, outcome: CheckoutOutcome(CheckoutOutcomeKind.serviceUnavailable, message: e.message));
        return;
      }
      if (e.statusCode == 404 || e.statusCode == 409 || e.statusCode == 400) {
        state = state.copyWith(submitting: false, outcome: CheckoutOutcome(CheckoutOutcomeKind.conflict, message: e.message));
        return;
      }
      state = state.copyWith(submitting: false, outcome: CheckoutOutcome(CheckoutOutcomeKind.error, message: e.message));
    }
  }
}

final checkoutFlowControllerProvider = StateNotifierProvider.family<CheckoutFlowController, CheckoutState, String>(
  (ref, cartId) => CheckoutFlowController(ref, cartId),
);
