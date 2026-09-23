/// Cart line item. `unitPrice`/`discount` are integer UZS — never a double — to
/// respect the "never use floating-point for accounting" requirement all the way
/// down to the client (R13.1 mirrored on-device; the backend re-validates and is
/// the ultimate source of truth for any persisted amount).
class CartItem {
  final String variantId;
  final String productName;
  final String sku;
  final int unitPrice;
  final double quantity;
  final int discount;

  const CartItem({
    required this.variantId,
    required this.productName,
    required this.sku,
    required this.unitPrice,
    required this.quantity,
    this.discount = 0,
  });

  int get lineGross => (unitPrice * quantity).round();
  int get lineTotal => lineGross - discount;

  CartItem copyWith({double? quantity, int? discount}) {
    return CartItem(
      variantId: variantId,
      productName: productName,
      sku: sku,
      unitPrice: unitPrice,
      quantity: quantity ?? this.quantity,
      discount: discount ?? this.discount,
    );
  }
}

enum PaymentMethod { cash, click, other }

class CartPayment {
  final PaymentMethod method;
  final int amount;
  const CartPayment(this.method, this.amount);

  String get apiValue => switch (method) {
        PaymentMethod.cash => 'CASH',
        PaymentMethod.click => 'CLICK',
        PaymentMethod.other => 'OTHER',
      };
}
