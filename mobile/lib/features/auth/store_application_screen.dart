import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/services/api_client.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/loading_button.dart';

/// Public store-registration form (R3.1). Submits directly to
/// POST /v1/store-applications — no authentication required, and the resulting
/// store starts PENDING with no operational access until a Super Admin approves it.
class StoreApplicationScreen extends ConsumerStatefulWidget {
  const StoreApplicationScreen({super.key});

  @override
  ConsumerState<StoreApplicationScreen> createState() => _StoreApplicationScreenState();
}

class _StoreApplicationScreenState extends ConsumerState<StoreApplicationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _storeName = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _ownerName = TextEditingController();
  final _password = TextEditingController();
  bool _submitting = false;
  String? _error;
  bool _submitted = false;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ApiClient.instance.dio.post('/v1/store-applications', data: {
        'storeName': _storeName.text.trim(),
        'contactPhone': _phone.text.trim(),
        'address': _address.text.trim(),
        'ownerFullName': _ownerName.text.trim(),
        'ownerPassword': _password.text,
      });
      setState(() => _submitted = true);
    } on DioException catch (e) {
      setState(() => _error = ApiException.fromDioError(e).message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (_submitted) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.storeApplicationTitle)),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.check_circle, color: Colors.green, size: 64),
                const SizedBox(height: 16),
                Text(l10n.applicationSubmitted, textAlign: TextAlign.center),
                const SizedBox(height: 24),
                ElevatedButton(onPressed: () => context.go('/login'), child: Text(l10n.loginButton)),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.storeApplicationTitle)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _storeName,
                decoration: InputDecoration(labelText: l10n.storeNameLabel),
                validator: (v) => (v == null || v.trim().length < 2) ? '—' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(labelText: l10n.phoneLabel),
                validator: (v) => (v == null || v.trim().length < 7) ? '—' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _address,
                decoration: InputDecoration(labelText: l10n.addressLabel),
                validator: (v) => (v == null || v.trim().length < 5) ? '—' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _ownerName,
                decoration: InputDecoration(labelText: l10n.ownerNameLabel),
                validator: (v) => (v == null || v.trim().length < 2) ? '—' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _password,
                obscureText: true,
                decoration: InputDecoration(labelText: l10n.passwordLabel),
                validator: (v) => (v == null || v.length < 8) ? '—' : null,
              ),
              const SizedBox(height: 24),
              if (_error != null)
                Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
              LoadingButton(loading: _submitting, onPressed: _submit, label: l10n.submitApplication),
            ],
          ),
        ),
      ),
    );
  }
}
