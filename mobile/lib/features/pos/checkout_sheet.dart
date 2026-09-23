import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/services/api_client.dart';
import '../../app/utils/money.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/loading_button.dart';
import 'cart_models.dart';
import 'cart_provider.dart';
import 'pos_repository.dart';

/// Checkout bottom sheet: choose one or more payment methods that sum to the cart
/// total (split payments, R7.3), then submit. Click is disabled while offline
/// (R8.8, R13.5) — a Click payment can never be initiated, let alone shown as
/// confirmed, without connectivity.
class CheckoutSheet extends ConsumerStatefulWidget {
  final String branchId;
  final bool isOnline;

  const CheckoutSheet({super.key, required this.branchId, required this.isOnline});

  @override
  ConsumerState<CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends ConsumerState<CheckoutSheet> {
  final Map<PaymentMethod, TextEditingController> _controllers = {
    PaymentMethod.cash: TextEditingController(),
    PaymentMethod.click: TextEditingController(),
    PaymentMethod.other: TextEditingController(),
  };
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Default: full amount in cash, the most common case.
    final cart = ref.read(cartProvider);
    _controllers[PaymentMethod.cash]!.text = cart.total.toString();
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  int _amount(PaymentMethod method) => int.tryParse(_controllers[method]!.text.trim()) ?? 0;

  Future<void> _submit() async {
    final cart = ref.read(cartProvider);
    final payments = PaymentMethod.values
        .map((m) => CartPayment(m, _amount(m)))
        .where((p) => p.amount > 0)
        .toList();

    final paid = payments.fold(0, (sum, p) => sum + p.amount);
    if (paid != cart.total) {
      setState(() => _error = "To'lov summasi (${formatUzs(paid)}) jami summaga (${formatUzs(cart.total)}) teng emas");
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final sale = await PosRepository().checkout(
        branchId: widget.branchId,
        items: cart.items,
        orderDiscount: cart.orderDiscount,
        payments: payments,
        idempotencyKey: cart.idempotencyKey,
        customerId: cart.customerId,
      );
      ref.read(cartProvider.notifier).clear();
      if (mounted) {
        Navigator.of(context).pop();
        context.push('/home/checkout-result/${sale['id']}');
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final cart = ref.watch(cartProvider);

    return Padding(
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 20,
        bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.payButton, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text('${l10n.total}: ${formatUzs(cart.total)}', style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: 16),
          _PaymentField(label: l10n.cashPayment, controller: _controllers[PaymentMethod.cash]!),
          const SizedBox(height: 8),
          _PaymentField(
            label: l10n.clickPayment,
            controller: _controllers[PaymentMethod.click]!,
            enabled: widget.isOnline,
            disabledHint: widget.isOnline ? null : l10n.offlineBanner,
          ),
          const SizedBox(height: 8),
          _PaymentField(label: l10n.otherPayment, controller: _controllers[PaymentMethod.other]!),
          const SizedBox(height: 16),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          LoadingButton(loading: _submitting, onPressed: _submit, label: l10n.payButton),
        ],
      ),
    );
  }
}

class _PaymentField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final bool enabled;
  final String? disabledHint;

  const _PaymentField({required this.label, required this.controller, this.enabled = true, this.disabledHint});

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      enabled: enabled,
      keyboardType: TextInputType.number,
      decoration: InputDecoration(
        labelText: label,
        suffixText: "so'm",
        helperText: enabled ? null : disabledHint,
      ),
    );
  }
}
