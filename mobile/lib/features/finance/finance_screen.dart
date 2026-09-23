import 'package:flutter/material.dart';

import '../../app/services/api_client.dart';
import '../../app/utils/money.dart';
import '../../l10n/app_localizations.dart';

/// Expense/income/cash-movement recording (R10.1). Every entry the cashier/manager
/// creates here requires a reason for cash movements and posts a ledger entry on the
/// backend (R10.1, R10.3) — this screen is a thin form over those endpoints.
class FinanceScreen extends StatefulWidget {
  const FinanceScreen({super.key});

  @override
  State<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends State<FinanceScreen> {
  List<dynamic> _expenses = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final response = await ApiClient.instance.dio.get('/v1/finance/expenses');
      setState(() => _expenses = response.data as List<dynamic>);
    } catch (_) {
      setState(() => _expenses = []);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.financeTitle)),
      floatingActionButton: FloatingActionButton(onPressed: () => _showExpenseDialog(context), child: const Icon(Icons.add)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                itemCount: _expenses.length,
                itemBuilder: (context, index) {
                  final e = _expenses[index] as Map<String, dynamic>;
                  return ListTile(
                    title: Text(e['description'] ?? l10n.expensesTitle),
                    subtitle: Text(e['expense_date'] ?? ''),
                    trailing: Text(formatUzs((e['amount'] as num).toInt())),
                  );
                },
              ),
            ),
    );
  }

  Future<void> _showExpenseDialog(BuildContext context) async {
    final amountController = TextEditingController();
    final descController = TextEditingController();
    await showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Yangi xarajat'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: descController, decoration: const InputDecoration(labelText: 'Tavsif')),
            TextField(controller: amountController, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: "Summa (so'm)")),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Bekor qilish')),
          TextButton(
            onPressed: () async {
              await ApiClient.instance.dio.post('/v1/finance/expenses', data: {
                'amount': int.tryParse(amountController.text) ?? 0,
                'expenseDate': DateTime.now().toIso8601String().substring(0, 10),
                'description': descController.text,
              });
              Navigator.pop(dialogContext);
              _load();
            },
            child: const Text('Saqlash'),
          ),
        ],
      ),
    );
  }
}
