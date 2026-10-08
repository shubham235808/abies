import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/medicine_summary.dart';
import '../domain/pharmacy_summary.dart';
import 'cart_controller.dart';
import 'local_cart_controller.dart';
import 'medicine_search_controller.dart';

/// Medicine detail (docs/mobile/IMPLEMENTATION-PLAN.md Phase 7), replacing
/// the Phase 1 `/product/:id` placeholder.
///
/// **Reads from navigation `extra`, never re-fetches by id** — same
/// `DiagnosticTestDetailScreen`/`PanchakarmaTherapyDetailScreen` pattern,
/// for the exact same reason: there is no `GET /public/medicines/[id]`
/// (confirmed by reading every route under `.../api/v1/public/medicines*`;
/// a real, already-known gap — see `MedicineSummary`'s doc comment and
/// `lib/features/pharmacy/PHASE.md`). The data is always the exact object
/// the search screen already fetched, never invented. Opened without
/// `extra` shows an honest "start from search" state. Reviews are the one
/// exception — `GET /public/medicines/[id]/reviews` is a real, id-keyed
/// endpoint, fetched for real here.
class MedicineDetailScreen extends ConsumerStatefulWidget {
  const MedicineDetailScreen({super.key, required this.medicine});

  final MedicineSummary? medicine;

  @override
  ConsumerState<MedicineDetailScreen> createState() => _MedicineDetailScreenState();
}

class _MedicineDetailScreenState extends ConsumerState<MedicineDetailScreen> {
  String? _variantId;
  int _quantity = 1;
  bool _adding = false;

  @override
  void initState() {
    super.initState();
    final medicine = widget.medicine;
    if (medicine != null && medicine.variants.isNotEmpty) {
      _variantId = medicine.variants.first.variantId;
    }
  }

  /// "Allow adding products to the cart without login" (brief) — signed in,
  /// this is still the real `POST /patients/me/cart` via `CartController`;
  /// signed out, it goes into the on-device-only `LocalCartController`
  /// instead (never `/patients/me/cart` — see `app_router.dart`'s redirect
  /// doc comment for why there's no guest-cart backend call to make here).
  Future<void> _addToCart(MedicineSummary medicine) async {
    setState(() => _adding = true);
    final signedIn = ref.read(authControllerProvider).value?.isSignedIn ?? false;
    String? error;
    if (signedIn) {
      error = await ref
          .read(cartControllerProvider.notifier)
          .addItem(pharmacyId: medicine.pharmacyId, medicineId: medicine.medicineId, variantId: _variantId, quantity: _quantity);
    } else {
      final matchingVariants = medicine.variants.where((v) => v.variantId == _variantId).toList();
      final unitPrice = matchingVariants.isNotEmpty ? matchingVariants.first.price : medicine.price;
      final variantLabel = matchingVariants.isNotEmpty ? matchingVariants.first.label : null;
      ref.read(localCartControllerProvider.notifier).addItem(
            pharmacyId: medicine.pharmacyId,
            pharmacyName: medicine.pharmacyName,
            medicineId: medicine.medicineId,
            medicineName: medicine.name,
            imageUrl: medicine.imageUrl,
            variantId: _variantId,
            variantLabel: variantLabel,
            unitPrice: unitPrice,
            quantity: _quantity,
          );
    }
    if (!mounted) return;
    setState(() => _adding = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error ?? 'Added to cart.')));
  }

  @override
  Widget build(BuildContext context) {
    final medicine = widget.medicine;
    return Scaffold(
      appBar: AppBar(title: const Text('Medicine')),
      body: medicine == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.info_outline, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      "This medicine isn't available as a direct link yet — please open it from the medicine catalogue.",
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: () => context.go('/pharmacy'), child: const Text('Go to catalogue')),
                  ],
                ),
              ),
            )
          : _buildBody(context, medicine),
    );
  }

  Widget _buildBody(BuildContext context, MedicineSummary medicine) {
    final selectedVariant = medicine.variants.where((v) => v.variantId == _variantId).toList();
    final price = selectedVariant.isNotEmpty ? selectedVariant.first.price : medicine.price;
    final maxQty = selectedVariant.isNotEmpty ? selectedVariant.first.quantityAvailable : medicine.quantityAvailable;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(medicine.name, style: Theme.of(context).textTheme.headlineSmall),
        if (medicine.genericName != null) Text(medicine.genericName!, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 4),
        if (medicine.pharmacyName != null)
          InkWell(
            onTap: () => context.push(
              '/pharmacy/store/${medicine.pharmacyId}',
              extra: PharmacySummary(id: medicine.pharmacyId, name: medicine.pharmacyName, serviceAreas: medicine.pharmacyServiceAreas),
            ),
            child: Text(
              medicine.pharmacyName!,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(decoration: TextDecoration.underline),
            ),
          ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            Chip(label: Text('₹$price')),
            if (medicine.form != null) Chip(label: Text(medicine.form!)),
            if (medicine.strength != null) Chip(label: Text(medicine.strength!)),
            if (medicine.brandName != null) Chip(label: Text(medicine.brandName!)),
            if (medicine.reviewCount > 0) Chip(label: Text('★ ${medicine.rating.toStringAsFixed(1)} (${medicine.reviewCount})')),
          ],
        ),
        const SizedBox(height: 16),
        if (medicine.hasVariants) ...[
          Text('Pack size', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: medicine.variants
                .map((v) => ChoiceChip(
                      label: Text('${v.label ?? 'Standard'} · ₹${v.price}'),
                      selected: _variantId == v.variantId,
                      onSelected: (_) => setState(() => _variantId = v.variantId),
                    ))
                .toList(),
          ),
          const SizedBox(height: 16),
        ],
        Text('Quantity', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Row(
          children: [
            IconButton(icon: const Icon(Icons.remove_circle_outline), onPressed: _quantity > 1 ? () => setState(() => _quantity--) : null),
            Text('$_quantity', style: Theme.of(context).textTheme.titleMedium),
            IconButton(
              icon: const Icon(Icons.add_circle_outline),
              onPressed: _quantity < maxQty ? () => setState(() => _quantity++) : null,
            ),
            const SizedBox(width: 8),
            Text('$maxQty in stock', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: _adding || maxQty == 0 ? null : () => _addToCart(medicine),
          icon: _adding
              ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.add_shopping_cart),
          label: Text(maxQty == 0 ? 'Out of stock at this pharmacy' : 'Add to cart'),
        ),
        const Divider(height: 32),
        Text('Reviews', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        _ReviewsSection(medicineId: medicine.medicineId),
      ],
    );
  }
}

class _ReviewsSection extends ConsumerWidget {
  const _ReviewsSection({required this.medicineId});

  final String medicineId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(medicineReviewsProvider(medicineId));
    return async.when(
      loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: LinearProgressIndicator()),
      error: (error, _) => ErrorStateView(
        message: error is ApiException ? error.message : 'Could not load reviews.',
        onRetry: () => ref.invalidate(medicineReviewsProvider(medicineId)),
      ),
      data: (reviews) => reviews.isEmpty
          ? const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('No reviews yet.'))
          : Column(
              children: reviews
                  .map((r) => Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          title: Row(
                            children: [
                              ...List.generate(5, (i) => Icon(i < r.rating ? Icons.star : Icons.star_border, size: 16)),
                              const SizedBox(width: 8),
                              if (r.authorName != null) Text(r.authorName!, style: Theme.of(context).textTheme.bodySmall),
                            ],
                          ),
                          subtitle: r.comment != null && r.comment!.isNotEmpty ? Text(r.comment!) : null,
                        ),
                      ))
                  .toList(),
            ),
    );
  }
}
