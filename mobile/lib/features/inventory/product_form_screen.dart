import 'package:flutter/material.dart';

import '../../widgets/loading_button.dart';
import 'inventory_repository.dart';

/// Simple product-creation form (R6.1). Barcode scanning to populate the barcode
/// field is available in the full app via the same BarcodeScannerScreen used in POS.
class ProductFormScreen extends StatefulWidget {
  const ProductFormScreen({super.key});

  @override
  State<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends State<ProductFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _sku = TextEditingController();
  final _barcode = TextEditingController();
  final _price = TextEditingController();
  final _cost = TextEditingController();
  final _minStock = TextEditingController(text: '0');
  bool _submitting = false;
  String? _error;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await InventoryRepository().createProduct(
        name: _name.text.trim(),
        sku: _sku.text.trim(),
        barcode: _barcode.text.trim().isEmpty ? null : _barcode.text.trim(),
        sellingPrice: int.parse(_price.text.trim()),
        purchaseCost: int.tryParse(_cost.text.trim()) ?? 0,
        minStock: double.tryParse(_minStock.text.trim()) ?? 0,
      );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = 'Saqlashda xatolik yuz berdi.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Yangi mahsulot')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(controller: _name, decoration: const InputDecoration(labelText: 'Nomi'), validator: (v) => (v == null || v.isEmpty) ? '—' : null),
              const SizedBox(height: 12),
              TextFormField(controller: _sku, decoration: const InputDecoration(labelText: 'SKU'), validator: (v) => (v == null || v.isEmpty) ? '—' : null),
              const SizedBox(height: 12),
              TextFormField(controller: _barcode, decoration: const InputDecoration(labelText: 'Shtrixkod (ixtiyoriy)')),
              const SizedBox(height: 12),
              TextFormField(
                controller: _price,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: "Sotish narxi (so'm)"),
                validator: (v) => (v == null || int.tryParse(v) == null) ? '—' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(controller: _cost, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: "Tannarx (so'm, ixtiyoriy)")),
              const SizedBox(height: 12),
              TextFormField(controller: _minStock, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Minimal qoldiq')),
              const SizedBox(height: 20),
              if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
              LoadingButton(loading: _submitting, onPressed: _submit, label: 'Saqlash'),
            ],
          ),
        ),
      ),
    );
  }
}
