import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/state_views.dart';
import '../../orders/presentation/order_widgets.dart' show formatDateTime;
import '../domain/pos_sale.dart';
import 'pos_controller.dart';

/// Recent counter sales (`GET /pos/sales`).
class SalesListScreen extends ConsumerWidget {
  const SalesListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(posSalesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Counter sales')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => e is ApiException && e.isTransportFailure
            ? OfflineStateView(onRetry: () => ref.invalidate(posSalesProvider))
            : ErrorStateView(message: e is ApiException ? e.message : 'Could not load sales.', onRetry: () => ref.invalidate(posSalesProvider)),
        data: (sales) => RefreshIndicator(
          onRefresh: () => ref.refresh(posSalesProvider.future),
          child: sales.isEmpty
              ? ListView(children: const [SizedBox(height: 120), EmptyStateView(message: 'No counter sales yet.')])
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: sales.length,
                  itemBuilder: (context, i) {
                    final s = sales[i];
                    return Card(
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      child: ListTile(
                        onTap: () => context.push('/pos/sales/${s.id}'),
                        title: Text(s.invoice?.invoiceNumber ?? 'No invoice'),
                        subtitle: Text('${formatDateTime(s.createdAt)} · ${s.itemCount} item${s.itemCount == 1 ? '' : 's'} · ${s.paymentMethod}'),
                        trailing: Text('₹${s.totalAmount}', style: Theme.of(context).textTheme.titleMedium),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

/// One sale's receipt. Right after checkout it's shown from the
/// [PosCheckoutResult] already in hand (the server's own response, plus the
/// re-read stock); opened from the list it fetches `GET /pos/sales/:id`.
class SaleReceiptScreen extends ConsumerWidget {
  const SaleReceiptScreen({super.key, required this.saleId, this.checkout});

  final String saleId;
  final PosCheckoutResult? checkout;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final Widget body;
    if (checkout?.sale != null) {
      body = _Receipt(sale: checkout!.sale!, remainingStock: checkout!.remainingStock, justRecorded: true);
    } else {
      body = ref.watch(posSaleProvider(saleId)).when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => e is ApiException && e.isTransportFailure
                ? OfflineStateView(onRetry: () => ref.invalidate(posSaleProvider(saleId)))
                : ErrorStateView(
                    message: e is ApiException ? e.message : 'Could not load this sale.',
                    onRetry: () => ref.invalidate(posSaleProvider(saleId)),
                  ),
            data: (sale) => _Receipt(sale: sale),
          );
    }
    return Scaffold(appBar: AppBar(title: const Text('Receipt')), body: body);
  }
}

class _Receipt extends StatelessWidget {
  const _Receipt({required this.sale, this.remainingStock = const {}, this.justRecorded = false});

  final PosSale sale;
  final Map<String, int> remainingStock;
  final bool justRecorded;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final semantic = Theme.of(context).extension<AppSemanticColors>()!;
    final invoice = sale.invoice;

    Widget row(String label, String value, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: bold ? text.titleMedium : null),
              Text(value, style: bold ? text.titleMedium : null),
            ],
          ),
        );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (justRecorded)
          Card(
            color: semantic.successSubtle,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text('Sale recorded.', style: TextStyle(color: semantic.successStrong, fontWeight: FontWeight.w600)),
            ),
          ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (sale.sellerLegalName != null) Text(sale.sellerLegalName!, style: text.titleMedium),
                if (sale.sellerGstin != null) Text('GSTIN ${sale.sellerGstin}${sale.sellerState != null ? ' · ${sale.sellerState}' : ''}', style: text.bodySmall),
                const SizedBox(height: 8),
                Text(invoice?.invoiceNumber ?? 'No invoice', style: text.titleSmall),
                Text(formatDateTime(sale.createdAt), style: text.bodySmall),
                if (sale.customerName != null || sale.customerPhone != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text('Billed to: ${sale.customerName ?? '—'}${sale.customerPhone != null ? ' · ${sale.customerPhone}' : ''}'),
                  ),
                const Divider(height: 24),
                for (final item in sale.items)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(item.medicineName),
                              Text('Batch ${item.batchNumber} · ${item.quantity} × ₹${item.unitPrice} · GST ${item.taxRate}%', style: text.bodySmall),
                            ],
                          ),
                        ),
                        Text('₹${item.lineAmount}'),
                      ],
                    ),
                  ),
                const Divider(height: 24),
                row('Subtotal', '₹${sale.subtotal}'),
                if (sale.discountAmount > 0) row('Discount', '−₹${sale.discountAmount}'),
                if (invoice != null) ...[
                  row('CGST', '₹${invoice.cgst}'),
                  row('SGST', '₹${invoice.sgst}'),
                  if (invoice.igst > 0) row('IGST', '₹${invoice.igst}'),
                ] else
                  row('GST', '₹${sale.taxAmount}'),
                const Divider(height: 16),
                row('Total', '₹${sale.totalAmount}', bold: true),
                const SizedBox(height: 4),
                Text('Paid via ${sale.paymentMethod}${sale.upiReference != null ? ' (${sale.upiReference})' : ''}', style: text.bodySmall),
              ],
            ),
          ),
        ),
        if (justRecorded && remainingStock.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text('Stock after this sale', style: text.titleSmall),
          const SizedBox(height: 4),
          Text('Re-read from your inventory just now.', style: text.bodySmall),
          for (final item in sale.items)
            if (remainingStock[posBatchKey(item.medicineId, item.batchNumber)] case final left?)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(child: Text('${item.medicineName} · batch ${item.batchNumber}')),
                    Text('$left left'),
                  ],
                ),
              ),
        ],
      ],
    );
  }
}
