import 'diagnostic_package_summary.dart';
import 'diagnostic_test_summary.dart';

enum DiagnosticBookingKind { tests, package }

/// What's being booked (docs/mobile/IMPLEMENTATION-PLAN.md Phase 6) —
/// enforces `bookOrderSchema`'s own mutual-exclusion rule
/// (`testIds` XOR `packageId`, `packages/domain/src/modules/diagnostics/
/// orders.schemas.ts`) **at the type level**, not just as a runtime check:
/// a [DiagnosticBookingTarget] is constructed as either
/// [DiagnosticBookingTarget.forTests] or [DiagnosticBookingTarget.forPackage]
/// — there is no constructor path that can produce one with both set, so
/// [testIds] and [packageId] can never both be non-null on the same
/// instance. This is why package booking and multi-test booking are built
/// as genuinely different flows (different search-screen selection UI,
/// different detail screens) rather than one form with both fields open.
///
/// All tests in a [forTests] target must share one `labId` — `bookOrderSchema`
/// takes a single `labId` for the whole order, so a multi-test booking can
/// only ever be "N tests from the same lab", never a cross-lab cart.
class DiagnosticBookingTarget {
  DiagnosticBookingTarget._({
    required this.kind,
    required this.tests,
    required this.package,
    required this.labId,
    required this.labName,
    required this.homeCollectionSupported,
    required this.displayName,
    required this.totalPrice,
  });

  factory DiagnosticBookingTarget.forTests(List<DiagnosticTestSummary> tests) {
    if (tests.isEmpty) throw ArgumentError('At least one test is required');
    final labId = tests.first.labId;
    if (tests.any((t) => t.labId != labId)) {
      throw ArgumentError('All tests in one diagnostic order must be from the same lab');
    }
    return DiagnosticBookingTarget._(
      kind: DiagnosticBookingKind.tests,
      tests: List.unmodifiable(tests),
      package: null,
      labId: labId,
      labName: tests.first.labName,
      homeCollectionSupported: tests.first.labHomeCollectionSupported,
      displayName: tests.map((t) => t.name).join(', '),
      totalPrice: tests.fold<int>(0, (sum, t) => sum + t.price),
    );
  }

  factory DiagnosticBookingTarget.forPackage(DiagnosticPackageSummary package) {
    return DiagnosticBookingTarget._(
      kind: DiagnosticBookingKind.package,
      tests: const [],
      package: package,
      labId: package.labId,
      labName: package.labName,
      homeCollectionSupported: package.labHomeCollectionSupported,
      displayName: package.name,
      totalPrice: package.price,
    );
  }

  final DiagnosticBookingKind kind;
  final List<DiagnosticTestSummary> tests;
  final DiagnosticPackageSummary? package;

  final String labId;
  final String? labName;
  final bool homeCollectionSupported;
  final String displayName;

  /// Client-side estimate only, same convention as every prior phase's
  /// booking screen — the backend computes the authoritative total
  /// (`bookOrder()`'s own `totalPrice`).
  final int totalPrice;

  /// Never non-null at the same time as [packageId] — see class doc.
  List<String>? get testIds => kind == DiagnosticBookingKind.tests ? tests.map((t) => t.id).toList() : null;

  /// Never non-null at the same time as [testIds] — see class doc.
  String? get packageId => kind == DiagnosticBookingKind.package ? package!.id : null;

  @override
  bool operator ==(Object other) {
    if (other is! DiagnosticBookingTarget || other.kind != kind || other.labId != labId) return false;
    if (kind == DiagnosticBookingKind.package) return other.package?.id == package?.id;
    final otherIds = other.tests.map((t) => t.id).toSet();
    final ids = tests.map((t) => t.id).toSet();
    return otherIds.length == ids.length && otherIds.containsAll(ids);
  }

  @override
  int get hashCode => Object.hash(kind, labId, package?.id, Object.hashAllUnordered(tests.map((t) => t.id)));
}
