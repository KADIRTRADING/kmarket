import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';
import 'inventory_repository.dart';

/// Inventory overview: product list + low-stock alert tab (R6.1, R6.6). Full
/// receive/transfer/count workflows are exposed via their own screens reachable
/// from here in the complete app; this scaffold focuses on the two most frequently
/// used views for a warehouse worker/manager on a phone.
class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> with SingleTickerProviderStateMixin {
  final _repository = InventoryRepository();
  late TabController _tabController;
  List<dynamic> _products = [];
  List<dynamic> _lowStock = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final products = await _repository.listProducts();
      final lowStock = await _repository.listLowStock();
      setState(() {
        _products = products;
        _lowStock = lowStock;
      });
    } catch (_) {
      setState(() => _error = "Yuklashda xatolik yuz berdi.");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.inventoryTitle),
        bottom: TabBar(controller: _tabController, tabs: [
          Tab(text: l10n.productsTitle),
          Tab(text: l10n.lowStockTitle),
        ]),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/home/inventory/new-product'),
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(_error!),
                    TextButton(onPressed: _load, child: Text(l10n.retryButton)),
                  ]),
                )
              : TabBarView(
                  controller: _tabController,
                  children: [
                    RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: _products.length,
                        itemBuilder: (context, index) {
                          final p = _products[index] as Map<String, dynamic>;
                          return ListTile(title: Text(p['product_name'] ?? p['name'] ?? ''), subtitle: Text(p['sku'] ?? ''));
                        },
                      ),
                    ),
                    RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: _lowStock.length,
                        itemBuilder: (context, index) {
                          final item = _lowStock[index] as Map<String, dynamic>;
                          return ListTile(
                            leading: const Icon(Icons.warning_amber, color: Colors.orange),
                            title: Text(item['name'] ?? ''),
                            subtitle: Text('Qoldiq: ${item['quantity']} / Min: ${item['min_stock']}'),
                          );
                        },
                      ),
                    ),
                  ],
                ),
    );
  }
}
