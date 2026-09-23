import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers/auth_provider.dart';
import '../../l10n/app_localizations.dart';

/// Shown instead of the POS home whenever the logged-in user's store is not ACTIVE
/// (R3.2). This is a UX convenience only — the backend independently rejects every
/// operational request for a non-ACTIVE store regardless of what this screen shows.
class StorePendingScreen extends ConsumerWidget {
  const StorePendingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final auth = ref.watch(authProvider);
    final isSuspended = auth.storeStatus == 'SUSPENDED';

    return Scaffold(
      appBar: AppBar(
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authProvider.notifier).logout(),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(isSuspended ? Icons.block : Icons.hourglass_top, size: 64, color: isSuspended ? Colors.red : Colors.orange),
              const SizedBox(height: 16),
              Text(
                isSuspended ? l10n.storeSuspendedBanner : l10n.storePendingBanner,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
