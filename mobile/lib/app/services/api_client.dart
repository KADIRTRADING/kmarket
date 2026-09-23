import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Base URL of the TezKassa backend. Overridden at build time via
/// `--dart-define=API_BASE_URL=https://api.tezkassa.uz` for release builds; defaults
/// to a local dev server for `flutter run`.
const String _defaultApiBaseUrl = 'http://10.0.2.2:4000'; // Android emulator -> host loopback

class TokenStorage {
  static const _storage = FlutterSecureStorage();
  static const _accessKey = 'tezkassa_access_token';
  static const _refreshKey = 'tezkassa_refresh_token';
  static const _storeStatusKey = 'tezkassa_store_status';

  static Future<void> save(String accessToken, String refreshToken, String? storeStatus) async {
    await _storage.write(key: _accessKey, value: accessToken);
    await _storage.write(key: _refreshKey, value: refreshToken);
    if (storeStatus != null) {
      await _storage.write(key: _storeStatusKey, value: storeStatus);
    }
  }

  static Future<String?> accessToken() => _storage.read(key: _accessKey);
  static Future<String?> refreshToken() => _storage.read(key: _refreshKey);
  static Future<String?> storeStatus() => _storage.read(key: _storeStatusKey);

  static Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _storeStatusKey);
  }
}

/// Thin wrapper over Dio implementing:
///  - Bearer token attachment on every request.
///  - Automatic access-token refresh on a 401, with the original request retried
///    exactly once (never an infinite loop).
///  - Network error normalization so screens can show one consistent
///    "no connection, try again" state (R13.4) instead of raw exception text.
class ApiClient {
  ApiClient._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: const String.fromEnvironment('API_BASE_URL', defaultValue: _defaultApiBaseUrl),
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await TokenStorage.accessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          final refreshed = await _tryRefresh();
          if (refreshed) {
            final retryResponse = await _dio.fetch(error.requestOptions);
            handler.resolve(retryResponse);
            return;
          }
        }
        handler.next(error);
      },
    ));
  }

  static final ApiClient instance = ApiClient._internal();
  late final Dio _dio;

  Dio get dio => _dio;

  Future<bool> _tryRefresh() async {
    final refreshToken = await TokenStorage.refreshToken();
    if (refreshToken == null) return false;
    try {
      final response = await _dio.post('/v1/auth/refresh', data: {'refreshToken': refreshToken});
      await TokenStorage.save(response.data['accessToken'], response.data['refreshToken'], null);
      return true;
    } catch (_) {
      await TokenStorage.clear();
      return false;
    }
  }
}

/// Normalizes any Dio/network failure into a small set of app-level error kinds so
/// UI code can render a consistent loading/error state (R13.4) without inspecting
/// raw exception types everywhere.
enum ApiErrorKind { network, unauthorized, forbidden, notFound, validation, server, unknown }

class ApiException implements Exception {
  final ApiErrorKind kind;
  final String message;
  final String? code;

  ApiException(this.kind, this.message, {this.code});

  factory ApiException.fromDioError(DioException error) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.connectionError) {
      return ApiException(ApiErrorKind.network, 'Internet aloqasi yo\'q. Qaytadan urinib ko\'ring.');
    }
    final status = error.response?.statusCode;
    final body = error.response?.data;
    final serverMessage = (body is Map && body['error'] is Map) ? body['error']['message'] as String? : null;
    final serverCode = (body is Map && body['error'] is Map) ? body['error']['code'] as String? : null;

    switch (status) {
      case 401:
        return ApiException(ApiErrorKind.unauthorized, serverMessage ?? 'Avtorizatsiya talab qilinadi', code: serverCode);
      case 403:
        return ApiException(ApiErrorKind.forbidden, serverMessage ?? 'Ruxsat yo\'q', code: serverCode);
      case 404:
        return ApiException(ApiErrorKind.notFound, serverMessage ?? 'Topilmadi', code: serverCode);
      case 422:
        return ApiException(ApiErrorKind.validation, serverMessage ?? 'Ma\'lumotlar noto\'g\'ri', code: serverCode);
      default:
        if (status != null && status >= 500) {
          return ApiException(ApiErrorKind.server, 'Serverda xatolik yuz berdi. Birozdan so\'ng qayta urinib ko\'ring.', code: serverCode);
        }
        return ApiException(ApiErrorKind.unknown, serverMessage ?? 'Noma\'lum xatolik', code: serverCode);
    }
  }
}
