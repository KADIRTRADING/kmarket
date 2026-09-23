import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'l10n/app_localizations.dart';
import 'app/router.dart';
import 'app/theme.dart';
import 'app/providers/settings_provider.dart';

/// TezKassa — retail store management app for Uzbekistan.
///
/// Entry point. Wraps the app in a [ProviderScope] (Riverpod) so every screen can
/// read/write shared state (auth session, active branch/register, theme, language)
/// through providers defined under lib/app/providers/.
void main() {
  runApp(const ProviderScope(child: TezKassaApp()));
}

class TezKassaApp extends ConsumerWidget {
  const TezKassaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'TezKassa',
      debugShowCheckedModeBanner: false,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: settings.themeMode,
      locale: settings.locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
    );
  }
}
