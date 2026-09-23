import 'package:flutter/material.dart';

import '../../app/services/api_client.dart';
import '../../l10n/app_localizations.dart';

/// Customer directory with search (R9.1). Tapping a customer opens their detail
/// (purchase/return/loyalty history) in the full app.
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  List<dynamic> _customers = [];
  bool _loading = true;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load([String? query]) async {
    setState(() => _loading = true);
    try {
      final response = await ApiClient.instance.dio.get('/v1/customers', queryParameters: {if (query != null && query.isNotEmpty) 'q': query});
      setState(() => _customers = response.data as List<dynamic>);
    } catch (_) {
      setState(() => _customers = []);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.customersTitle)),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showCreateDialog(context),
        child: const Icon(Icons.person_add),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchController,
              decoration: const InputDecoration(hintText: 'Ism yoki telefon bo\'yicha qidirish', prefixIcon: Icon(Icons.search)),
              onSubmitted: _load,
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    itemCount: _customers.length,
                    itemBuilder: (context, index) {
                      final c = _customers[index] as Map<String, dynamic>;
                      return ListTile(
                        title: Text(c['full_name'] ?? ''),
                        subtitle: Text(c['phone'] ?? ''),
                        trailing: Text('${c['loyalty_points_balance'] ?? 0} ball'),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _showCreateDialog(BuildContext context) async {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    await showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Yangi mijoz'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameController, decoration: const InputDecoration(labelText: 'F.I.Sh.')),
            TextField(controller: phoneController, decoration: const InputDecoration(labelText: 'Telefon')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Bekor qilish')),
          TextButton(
            onPressed: () async {
              await ApiClient.instance.dio.post('/v1/customers', data: {'fullName': nameController.text, 'phone': phoneController.text});
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
