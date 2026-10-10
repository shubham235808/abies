import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Where to send the customer back to after a successful sign-in, when
/// `/sign-in` was reached away from something else they were already doing
/// — either the router's own `redirect` (an unauthenticated visit to a
/// protected route, `lib/core/router/app_router.dart`) or a screen that
/// gates one specific *action* rather than its whole route (e.g.
/// `/panchakarma/book`'s "Confirm booking", `/pharmacy/cart`'s "Checkout").
///
/// A plain `String` location plus an optional `extra` — exactly the two
/// things `GoRouter.go`/`push` already take — rather than a new mechanism:
/// whatever got the customer to the screen they were on (often nothing,
/// since most protected routes need no `extra` to render; `/panchakarma/
/// book` and `/diagnostics/book` are the two exceptions, needing the
/// therapy/args object back to render anything at all) is carried through
/// unchanged.
///
/// Why a provider and not a `redirect` return value or a query param:
/// go_router's `redirect` callback can only return a location `String` —
/// there is no way to also hand back an `extra` object from it — and some
/// of the objects that need to survive the round trip
/// (`PanchakarmaTherapy`, `DiagnosticBookingArgs`) aren't meaningfully
/// representable as URL query text. This provider is the one place both
/// triggers (the router's redirect, and a screen's own "this one action
/// needs auth" check) write to, and `completeSignIn` is the one place that
/// reads and clears it, right after a successful sign-in.
class PendingRedirect {
  const PendingRedirect({required this.location, this.extra});

  /// A full location this app's own `GoRouter` can navigate to directly
  /// (e.g. `/panchakarma/book`, `/doctor/abc123/book`) — already resolved,
  /// never a route *template*.
  final String location;

  /// Whatever that location's own route needs as `extra` to render for real
  /// instead of its "nothing to show, start over" placeholder — `null` for
  /// every route that needs none.
  final Object? extra;
}

/// `null` means "nothing pending — go home after sign-in", the plain
/// "I tapped Sign in from the home screen" case.
final pendingRedirectProvider = StateProvider<PendingRedirect?>((ref) => null);
