import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:printing/printing.dart';

import '../../app/services/api_client.dart';
import '../../l10n/app_localizations.dart';

/// Post-checkout confirmation: fetches the generated receipt PDF from
/// `GET /v1/sales/:id/receipt.pdf` (backend/src/modules/sales/receipt.ts) and offers
/// print (via the OS print dialog / any connected printer) and share. The receipt
/// itself is explicitly labeled as a non-fiscal sales receipt by the backend (R7.6);
/// this screen does not add or imply any fiscal claim.
class CheckoutResultScreen extends StatelessWidget {
  final String saleId;
  const CheckoutResultScreen({super.key, required this.saleId});

  Future<Uint8List> _fetchReceiptBytes() async {
    final response = await ApiClient.instance.dio.get<List<int>>(
      '/v1/sales/$saleId/receipt.pdf',
      options: Options(responseType: ResponseType.bytes),
    );
    return Uint8List.fromList(response.data ?? []);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.saleCompleted)),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle, color: Colors.green, size: 72),
            const SizedBox(height: 16),
            Text(l10n.saleCompleted, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(l10n.notFiscalReceiptNotice, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                OutlinedButton.icon(
                  icon: const Icon(Icons.print),
                  label: Text(l10n.printReceipt),
                  onPressed: () async {
                    final bytes = await _fetchReceiptBytes();
                    await Printing.layoutPdf(onLayout: (_) async => bytes);
                  },
                ),
                const SizedBox(width: 12),
                OutlinedButton.icon(
                  icon: const Icon(Icons.share),
                  label: Text(l10n.shareReceipt),
                  onPressed: () async {
                    final bytes = await _fetchReceiptBytes();
                    await Printing.sharePdf(bytes: bytes, filename: 'receipt-$saleId.pdf');
                  },
                ),
              ],
            ),
            const SizedBox(height: 24),
            ElevatedButton(onPressed: () => context.go('/home/pos'), child: const Text('Yangi sotuv')),
          ],
        ),
      ),
    );
  }
}

