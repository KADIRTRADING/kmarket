import 'package:dio/dio.dart';

import '../../app/services/api_client.dart';
import 'cart_models.dart';

class ProductSearchResult {
  final String variantId;
  final String productName;
  final String sku;
  final String? barcode;
  final int sellingPrice;
  final double stockQuantity;

  ProductSearchResult({
    required this.variantId,
    required this.productName,
    required this.sku,
    required this.sellingPrice,
    required this.stockQuantity,
    this.barcode,
  });

  factory ProductSearchResult.fromJson(Map<String, dynamic> json) {
    return ProductSearchResult(
      variantId: json['variant_id'] as String,
      productName: json['product_name'] as String,
      sku: json['sku'] as String,
      barcode: json['barcode'] as String?,
      sellingPrice: (json['selling_price'] as num).toInt(),
      stockQuantity: (json['stock_quantity'] as num?)?.toDouble() ?? 0,
    );
  }
}

/// All POS-related HTTP calls. Kept separate from UI widgets so the checkout logic
/// (idempotency header, payment-shape mapping) has exactly one implementation.
class PosRepository {
  final Dio _dio = ApiClient.instance.dio;

  Future<List<ProductSearchResult>> searchProducts({required String branchId, String? query, String? barcode}) async {
    final response = await _dio.get('/v1/products', queryParameters: {
      'branchId': branchId,
      if (query != null && query.isNotEmpty) 'q': query,
      if (barcode != null && barcode.isNotEmpty) 'barcode': barcode,
    });
    final items = (response.data['items'] ?? response.data) as List;
    // The backend returns a flat array from searchProducts (not paginated envelope
    // in this endpoint) — see backend/src/modules/catalog/routes.ts GET /v1/products.
    return items.whereType<Map<String, dynamic>>().map(ProductSearchResult.fromJson).toList();
  }

  Future<Map<String, dynamic>> checkout({
    required String branchId,
    String? cashRegisterId,
    String? shiftId,
    String? customerId,
    required List<CartItem> items,
    required int orderDiscount,
    required List<CartPayment> payments,
    required String idempotencyKey,
  }) async {
    try {
      final response = await _dio.post(
        '/v1/sales',
        options: Options(headers: {'Idempotency-Key': idempotencyKey}),
        data: {
          'branchId': branchId,
          if (cashRegisterId != null) 'cashRegisterId': cashRegisterId,
          if (shiftId != null) 'shiftId': shiftId,
          if (customerId != null) 'customerId': customerId,
          'items': items
              .map((i) => {
                    'variantId': i.variantId,
                    'quantity': i.quantity,
                    'unitPrice': i.unitPrice,
                    'discount': i.discount,
                  })
              .toList(),
          'discountTotal': orderDiscount,
          'taxTotal': 0,
          'payments': payments.map((p) => {'method': p.apiValue, 'amount': p.amount}).toList(),
        },
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<void> holdCart({required String branchId, String? label, required Map<String, dynamic> cart}) async {
    await _dio.post('/v1/held-carts', data: {'branchId': branchId, 'label': label, 'cart': cart});
  }
}
