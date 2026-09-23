import 'package:flutter/material.dart';

/// A primary button that shows a spinner and disables itself while [loading] is
/// true — used throughout the app so every async action has a consistent, clear
/// loading state (R13.7) instead of a silently-unresponsive tap.
class LoadingButton extends StatelessWidget {
  final bool loading;
  final VoidCallback onPressed;
  final String label;

  const LoadingButton({super.key, required this.loading, required this.onPressed, required this.label});

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: loading ? null : onPressed,
      child: loading
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          : Text(label),
    );
  }
}
