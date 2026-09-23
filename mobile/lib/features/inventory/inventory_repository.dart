import '../../app/services/api_client.dart';

class InventoryRepository {
  final _dio = ApiClient.instance.dio;

  Future<List<dynamic>> listLowStock({String? branchId}) async {
    final response = await _dio.get('/v1/stock/low-stock', queryParameters: {if (branchId != null) 'branchId': branchId});
    return response.data as List<dynamic>;
  }

  Future<List<dynamic>> listProducts({String? query}) async {
    final response = await _dio.get('/v1/products', queryParameters: {if (query != null && query.isNotEmpty) 'q': query});
    return (response.data['items'] ?? response.data) as List<dynamic>;
  }

  Future<List<dynamic>> listStockMovements({String? branchId, String? variantId}) async {
    final response = await _dio.get('/v1/stock-movements', queryParameters: {
      if (branchId != null) 'branchId': branchId,
      if (variantId != null) 'variantId': variantId,
    });
    return response.data as List<dynamic>;
  }

  Future<void> createProduct({
    required String name,
    required String sku,
    String? barcode,
    required int sellingPrice,
    int purchaseCost = 0,
    double minStock = 0,
  }) async {
    await _dio.post('/v1/products', data: {
      'name': name,
      'unit': 'dona',
      'variants': [
        {
          'sku': sku,
          'barcode': barcode,
          'sellingPrice': sellingPrice,
          'purchaseCost': purchaseCost,
          'minStock': minStock,
          'isDefault': true,
        }
      ],
    });
  }
}
