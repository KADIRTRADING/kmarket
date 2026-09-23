import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Tracks online/offline state so screens (especially POS) can disable Click
/// payment and show an offline banner (R13.4, R13.5, R8.8). A device is treated as
/// "online" only when it has a non-none connectivity result; this does not guarantee
/// the backend is reachable, but is sufficient to gate "don't even attempt a Click
/// payment while the OS reports no network."
final connectivityProvider = StreamProvider<bool>((ref) {
  return Connectivity().onConnectivityChanged.map((results) {
    return results.any((r) => r != ConnectivityResult.none);
  });
});
