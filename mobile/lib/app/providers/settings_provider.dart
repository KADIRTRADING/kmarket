import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// App-wide display settings: language (uz default, ru supported — R13.6) and
/// light/dark/system theme (R13.7). Persisted to secure storage so the choice
/// survives app restarts without requiring login.
class AppSettings {
  final Locale locale;
  final ThemeMode themeMode;

  const AppSettings({required this.locale, required this.themeMode});

  AppSettings copyWith({Locale? locale, ThemeMode? themeMode}) {
    return AppSettings(
      locale: locale ?? this.locale,
      themeMode: themeMode ?? this.themeMode,
    );
  }
}

class SettingsController extends StateNotifier<AppSettings> {
  static const _storage = FlutterSecureStorage();
  static const _localeKey = 'tezkassa_locale';
  static const _themeKey = 'tezkassa_theme_mode';

  SettingsController() : super(const AppSettings(locale: Locale('uz'), themeMode: ThemeMode.system)) {
    _restore();
  }

  Future<void> _restore() async {
    final storedLocale = await _storage.read(key: _localeKey);
    final storedTheme = await _storage.read(key: _themeKey);
    state = AppSettings(
      locale: Locale(storedLocale ?? 'uz'),
      themeMode: _themeModeFromString(storedTheme) ?? ThemeMode.system,
    );
  }

  Future<void> setLocale(Locale locale) async {
    state = state.copyWith(locale: locale);
    await _storage.write(key: _localeKey, value: locale.languageCode);
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = state.copyWith(themeMode: mode);
    await _storage.write(key: _themeKey, value: mode.name);
  }

  ThemeMode? _themeModeFromString(String? value) {
    switch (value) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      case 'system':
        return ThemeMode.system;
      default:
        return null;
    }
  }
}

final settingsProvider = StateNotifierProvider<SettingsController, AppSettings>((ref) {
  return SettingsController();
});
