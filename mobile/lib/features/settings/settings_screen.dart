import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers/auth_provider.dart';
import '../../app/providers/settings_provider.dart';
import '../../l10n/app_localizations.dart';

/// Language (uz default / ru) and theme (light/dark/system) switcher (R13.6, R13.7),
/// plus logout.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final settings = ref.watch(settingsProvider);
    final controller = ref.read(settingsProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: ListView(
        children: [
          ListTile(
            title: Text(l10n.languageLabel),
            trailing: DropdownButton<String>(
              value: settings.locale.languageCode,
              items: const [
                DropdownMenuItem(value: 'uz', child: Text("O'zbekcha")),
                DropdownMenuItem(value: 'ru', child: Text('Русский')),
              ],
              onChanged: (value) {
                if (value != null) controller.setLocale(Locale(value));
              },
            ),
          ),
          ListTile(
            title: Text(l10n.themeLabel),
            trailing: DropdownButton<ThemeMode>(
              value: settings.themeMode,
              items: [
                DropdownMenuItem(value: ThemeMode.light, child: Text(l10n.lightTheme)),
                DropdownMenuItem(value: ThemeMode.dark, child: Text(l10n.darkTheme)),
                DropdownMenuItem(value: ThemeMode.system, child: Text(l10n.systemTheme)),
              ],
              onChanged: (value) {
                if (value != null) controller.setThemeMode(value);
              },
            ),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout),
            title: Text(l10n.logoutButton),
            onTap: () => ref.read(authProvider.notifier).logout(),
          ),
        ],
      ),
    );
  }
}
