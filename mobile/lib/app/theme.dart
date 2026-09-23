import 'package:flutter/material.dart';

/// TezKassa design tokens. Clean, fast, professional — optimized for quick reading
/// on a store counter (large tap targets, high-contrast totals, accessible text
/// sizes) rather than a decorative consumer-app look.
class TezKassaColors {
  static const primary = Color(0xFF1656D9); // TezKassa blue
  static const primaryDark = Color(0xFF4C86FF);
  static const success = Color(0xFF16A34A);
  static const warning = Color(0xFFD97706);
  static const danger = Color(0xFFDC2626);
}

ThemeData buildLightTheme() {
  final colorScheme = ColorScheme.fromSeed(
    seedColor: TezKassaColors.primary,
    brightness: Brightness.light,
  );
  return _baseTheme(colorScheme);
}

ThemeData buildDarkTheme() {
  final colorScheme = ColorScheme.fromSeed(
    seedColor: TezKassaColors.primaryDark,
    brightness: Brightness.dark,
  );
  return _baseTheme(colorScheme);
}

ThemeData _baseTheme(ColorScheme colorScheme) {
  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    // Accessible default text sizes (R13.7): base body text no smaller than 15sp,
    // and the POS total uses a distinctly large, bold size for at-a-glance reading.
    textTheme: const TextTheme(
      bodyMedium: TextStyle(fontSize: 15),
      bodyLarge: TextStyle(fontSize: 16),
      titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
      headlineSmall: TextStyle(fontSize: 26, fontWeight: FontWeight.w800),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: colorScheme.surface,
      foregroundColor: colorScheme.onSurface,
      elevation: 0,
      centerTitle: false,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(48), // large tap target for gloved/quick taps
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      filled: true,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
    ),
  );
}
