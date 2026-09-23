import 'package:flutter/material.dart';

import '../../app/services/api_client.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/loading_button.dart';

/// Cashier shift open/close (R5.3). Expected closing cash is computed by the
/// backend from actual sales/cash-movement records, never trusted from client
/// input — this screen only collects opening/actual counted cash and displays the
/// server-computed expected amount and resulting difference after closing.
class ShiftScreen extends StatefulWidget {
  const ShiftScreen({super.key});

  @override
  State<ShiftScreen> createState() => _ShiftScreenState();
}

class _ShiftScreenState extends State<ShiftScreen> {
  Map<String, dynamic>? _openShift;
  final _openingCashController = TextEditingController(text: '0');
  final _actualCashController = TextEditingController();
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _closedResult;

  Future<void> _openShift() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.post('/v1/shifts/open', data: {
        'branchId': 'ACTIVE_BRANCH_ID', // TODO_SESSION
        'cashRegisterId': 'ACTIVE_REGISTER_ID', // TODO_SESSION
        'openingCash': int.tryParse(_openingCashController.text) ?? 0,
      });
      setState(() => _openShift = response.data as Map<String, dynamic>);
    } catch (e) {
      setState(() => _error = 'Smenani ochishda xatolik');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _closeShift() async {
    if (_openShift == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.post('/v1/shifts/${_openShift!['id']}/close', data: {
        'actualClosingCash': int.tryParse(_actualCashController.text) ?? 0,
      });
      setState(() {
        _closedResult = response.data as Map<String, dynamic>;
        _openShift = null;
      });
    } catch (e) {
      setState(() => _error = 'Smenani yopishda xatolik');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(_openShift == null ? l10n.shiftOpenTitle : l10n.shiftCloseTitle)),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: _openShift == null
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(controller: _openingCashController, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.openingCash)),
                  const SizedBox(height: 16),
                  if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  LoadingButton(loading: _busy, onPressed: _openShift, label: l10n.shiftOpenTitle),
                  if (_closedResult != null) ..._closedSummary(_closedResult!, l10n),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Smena ochilgan: ${_openShift!['opened_at']}'),
                  const SizedBox(height: 16),
                  TextField(controller: _actualCashController, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.actualCash)),
                  const SizedBox(height: 16),
                  if (_error != null) Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  LoadingButton(loading: _busy, onPressed: _closeShift, label: l10n.shiftCloseTitle),
                ],
              ),
      ),
    );
  }

  List<Widget> _closedSummary(Map<String, dynamic> result, AppLocalizations l10n) {
    return [
      const SizedBox(height: 24),
      Text('${l10n.expectedCash}: ${result['expected_closing_cash']}'),
      Text('${l10n.actualCash}: ${result['actual_closing_cash']}'),
      Text('${l10n.cashDifference}: ${result['cash_difference']}'),
    ];
  }
}
