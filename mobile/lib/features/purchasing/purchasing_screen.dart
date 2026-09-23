import 'package:flutter/material.dart';

import '../../app/services/api_client.dart';
import '../../l10n/app_localizations.dart';

/// Suppliers + purchase orders overview (R6.4). Goods-receipt/write-off actions are
/// reachable from a purchase order's detail screen in the full app.
class PurchasingScreen extends StatefulWidget {
  const PurchasingScreen({super.key});

  @override
  State<PurchasingScreen> createState() => _PurchasingScreenState();
}

class _PurchasingScreenState extends State<PurchasingScreen> {
  List<dynamic> _suppliers = [];
  List<dynamic> _purchaseOrders = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ApiClient.instance.dio;
      final suppliers = await dio.get('/v1/suppliers');
      final orders = await dio.get('/v1/purchase-orders');
      setState(() {
        _suppliers = suppliers.data as List<dynamic>;
        _purchaseOrders = orders.data as List<dynamic>;
      });
    } catch (_) {
      // handled by empty-state rendering below
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.purchasingTitle),
          bottom: TabBar(tabs: [Tab(text: l10n.suppliersTitle), Tab(text: l10n.purchaseOrdersTitle)]),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: TabBarView(
                  children: [
                    ListView.builder(
                      itemCount: _suppliers.length,
                      itemBuilder: (context, index) {
                        final s = _suppliers[index] as Map<String, dynamic>;
                        return ListTile(title: Text(s['name'] ?? ''), subtitle: Text(s['contact_phone'] ?? ''));
                      },
                    ),
                    ListView.builder(
                      itemCount: _purchaseOrders.length,
                      itemBuilder: (context, index) {
                        final po = _purchaseOrders[index] as Map<String, dynamic>;
                        return ListTile(title: Text(po['order_number'] ?? ''), subtitle: Text(po['status'] ?? ''));
                      },
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
