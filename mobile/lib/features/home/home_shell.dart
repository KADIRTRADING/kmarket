import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';

/// The main authenticated app shell: a set of module entry points reachable from a
/// simple grid, matching the role-based feature set (POS, inventory, purchasing,
/// customers, finance, reports, shift, settings). Kept as a grid rather than a fixed
/// 5-tab bottom bar because the number of modules varies by role.
class HomeShell extends StatelessWidget {
  const HomeShell({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final tiles = <_ModuleTile>[
      _ModuleTile(l10n.posTitle, Icons.point_of_sale, '/home/pos'),
      _ModuleTile(l10n.shiftOpenTitle, Icons.schedule, '/home/shift'),
      _ModuleTile(l10n.inventoryTitle, Icons.inventory_2, '/home/inventory'),
      _ModuleTile(l10n.purchasingTitle, Icons.local_shipping, '/home/purchasing'),
      _ModuleTile(l10n.customersTitle, Icons.people, '/home/customers'),
      _ModuleTile(l10n.financeTitle, Icons.account_balance_wallet, '/home/finance'),
      _ModuleTile(l10n.reportsTitle, Icons.bar_chart, '/home/reports'),
      _ModuleTile(l10n.settingsTitle, Icons.settings, '/home/settings'),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.appName)),
      body: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.3,
        ),
        itemCount: tiles.length,
        itemBuilder: (context, index) {
          final tile = tiles[index];
          return Card(
            child: InkWell(
              onTap: () => context.push(tile.route),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(tile.icon, size: 36, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(height: 12),
                    Text(tile.label, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ModuleTile {
  final String label;
  final IconData icon;
  final String route;
  _ModuleTile(this.label, this.icon, this.route);
}
