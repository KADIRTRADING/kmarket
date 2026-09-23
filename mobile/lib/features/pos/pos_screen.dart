import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers/connectivity_provider.dart';
import '../../app/utils/money.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/loading_button.dart';
import 'barcode_scanner_screen.dart';
import 'cart_models.dart';
import 'cart_provider.dart';
import 'checkout_sheet.dart';
import 'pos_repository.dart';

/// The primary cashier screen (R7.1-R7.8). Optimized for fast phone/tablet use:
/// large search field at top, scrollable results, sticky cart summary + big "Pay"
/// button at the bottom so a cashier's thumb never has to travel far.
///
/// NOTE: this scaffold wires the full UI and calls the real backend endpoints; it
/// assumes an active branchId/cashRegisterId/shiftId are available from a session
/// context (in the full app, sourced from a branch/shift provider set at login and
/// shift-open time — omitted here for brevity but the wiring points are marked
/// TODO_SESSION below).
class PosScreen extends ConsumerStatefulWidget {
  const PosScreen({super.key});

  @override
  ConsumerState<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends ConsumerState<PosScreen> {
  final _searchController = TextEditingController();
  final _repository = PosRepository();
  List<ProductSearchResult> _results = [];
  bool _loading = false;
  String? _error;

  // TODO_SESSION: replace with the real active branch id from session state.
  String get _branchId => 'ACTIVE_BRANCH_ID';

  Future<void> _search(String query) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await _repository.searchProducts(branchId: _branchId, query: query);
      setState(() => _results = results);
    } catch (e) {
      setState(() => _error = 'Qidirishda xatolik yuz berdi. Qaytadan urinib ko\'ring.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _scanBarcode() async {
    final barcode = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
    );
    if (barcode == null) return;
    try {
      final results = await _repository.searchProducts(branchId: _branchId, barcode: barcode);
      if (results.isNotEmpty) {
        _addToCart(results.first);
      }
    } catch (_) {
      // ignore scan-lookup failure silently; cashier can retry via search
    }
  }

  void _addToCart(ProductSearchResult product) {
    ref.read(cartProvider.notifier).addItem(CartItem(
          variantId: product.variantId,
          productName: product.productName,
          sku: product.sku,
          unitPrice: product.sellingPrice,
          quantity: 1,
        ));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final cart = ref.watch(cartProvider);
    final isOnline = ref.watch(connectivityProvider).valueOrNull ?? true;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.posTitle)),
      body: Column(
        children: [
          if (!isOnline)
            Container(
              width: double.infinity,
              color: Colors.orange.shade100,
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              child: Text(l10n.offlineBanner, style: const TextStyle(fontSize: 13)),
            ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: l10n.searchProductPlaceholder,
                      prefixIcon: const Icon(Icons.search),
                    ),
                    onSubmitted: _search,
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  icon: const Icon(Icons.qr_code_scanner),
                  tooltip: l10n.scanBarcode,
                  onPressed: _scanBarcode,
                ),
              ],
            ),
          ),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null) Padding(padding: const EdgeInsets.all(8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          Expanded(
            child: _results.isEmpty
                ? _CartList(cart: cart)
                : ListView.builder(
                    itemCount: _results.length,
                    itemBuilder: (context, index) {
                      final product = _results[index];
                      return ListTile(
                        title: Text(product.productName),
                        subtitle: Text('${product.sku} · ${formatUzs(product.sellingPrice)} · Qoldiq: ${product.stockQuantity}'),
                        trailing: IconButton(icon: const Icon(Icons.add_circle), onPressed: () => _addToCart(product)),
                        onTap: () => _addToCart(product),
                      );
                    },
                  ),
          ),
          _CartSummaryBar(cart: cart, isOnline: isOnline, branchId: _branchId),
        ],
      ),
    );
  }
}

class _CartList extends ConsumerWidget {
  final CartState cart;
  const _CartList({required this.cart});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    if (cart.isEmpty) {
      return Center(child: Text(l10n.cartEmpty, style: Theme.of(context).textTheme.bodyLarge));
    }
    return ListView.builder(
      itemCount: cart.items.length,
      itemBuilder: (context, index) {
        final item = cart.items[index];
        return ListTile(
          title: Text(item.productName),
          subtitle: Text('${formatUzs(item.unitPrice)} x ${item.quantity}'),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(icon: const Icon(Icons.remove), onPressed: () => ref.read(cartProvider.notifier).updateQuantity(item.variantId, item.quantity - 1)),
              Text('${item.quantity}'),
              IconButton(icon: const Icon(Icons.add), onPressed: () => ref.read(cartProvider.notifier).updateQuantity(item.variantId, item.quantity + 1)),
              IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => ref.read(cartProvider.notifier).removeItem(item.variantId)),
            ],
          ),
        );
      },
    );
  }
}

class _CartSummaryBar extends ConsumerWidget {
  final CartState cart;
  final bool isOnline;
  final String branchId;

  const _CartSummaryBar({required this.cart, required this.isOnline, required this.branchId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.total, style: Theme.of(context).textTheme.bodyMedium),
                Text(formatUzs(cart.total), style: Theme.of(context).textTheme.headlineSmall),
              ],
            ),
          ),
          ElevatedButton.icon(
            icon: const Icon(Icons.pause),
            label: Text(l10n.holdCart),
            onPressed: cart.isEmpty
                ? null
                : () async {
                    await PosRepository().holdCart(branchId: branchId, cart: {
                      'items': cart.items
                          .map((i) => {'variantId': i.variantId, 'quantity': i.quantity, 'unitPrice': i.unitPrice, 'discount': i.discount})
                          .toList(),
                    });
                    ref.read(cartProvider.notifier).clear();
                  },
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: cart.isEmpty
                ? null
                : () => showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => CheckoutSheet(branchId: branchId, isOnline: isOnline),
                    ),
            child: Text(l10n.payButton),
          ),
        ],
      ),
    );
  }
}
