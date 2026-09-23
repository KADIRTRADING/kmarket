import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_client.dart';

enum AuthStatus { unknown, unauthenticated, authenticated }

class AuthState {
  final AuthStatus status;
  final String? fullName;
  final String? role;
  final String? storeId;
  final String? storeStatus; // PENDING | ACTIVE | REJECTED | SUSPENDED, null for platform-less flows

  const AuthState({
    required this.status,
    this.fullName,
    this.role,
    this.storeId,
    this.storeStatus,
  });

  static const unknownState = AuthState(status: AuthStatus.unknown);
  static const loggedOut = AuthState(status: AuthStatus.unauthenticated);

  bool get isStoreActive => storeStatus == 'ACTIVE';
}

/// Owns login/logout and the current session's role/store-status, which every
/// screen uses to decide what to show (e.g. a PENDING banner instead of the POS
/// screen — mirrors the backend's own enforcement, but is NOT a substitute for it;
/// the backend rejects operational requests regardless of what this app displays).
class AuthController extends StateNotifier<AuthState> {
  AuthController() : super(AuthState.unknownState) {
    _restore();
  }

  final Dio _dio = ApiClient.instance.dio;

  Future<void> _restore() async {
    final token = await TokenStorage.accessToken();
    if (token == null) {
      state = AuthState.loggedOut;
      return;
    }
    final storeStatus = await TokenStorage.storeStatus();
    // We don't have a "me" endpoint call here to keep this scaffold self-contained;
    // in the full app this would call GET /v1/auth/me to refresh fullName/role/store
    // status. For now we optimistically mark as authenticated if a token exists.
    state = AuthState(status: AuthStatus.authenticated, storeStatus: storeStatus);
  }

  Future<void> login(String phone, String password) async {
    try {
      final response = await _dio.post('/v1/auth/login', data: {'phone': phone, 'password': password});
      final data = response.data as Map<String, dynamic>;
      final actor = data['actor'] as Map<String, dynamic>;
      await TokenStorage.save(data['accessToken'], data['refreshToken'], actor['storeStatus'] as String?);
      state = AuthState(
        status: AuthStatus.authenticated,
        fullName: actor['fullName'] as String?,
        role: actor['role'] as String?,
        storeId: actor['storeId'] as String?,
        storeStatus: actor['storeStatus'] as String?,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<void> logout() async {
    final refreshToken = await TokenStorage.refreshToken();
    if (refreshToken != null) {
      try {
        await _dio.post('/v1/auth/logout', data: {'refreshToken': refreshToken});
      } catch (_) {
        // best-effort server-side revoke; local logout proceeds regardless
      }
    }
    await TokenStorage.clear();
    state = AuthState.loggedOut;
  }
}

final authProvider = StateNotifierProvider<AuthController, AuthState>((ref) => AuthController());
