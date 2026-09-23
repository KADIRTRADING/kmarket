import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import 'cart_models.dart';

/// The active POS cart for the current branch/register. Holds an `idempotencyKey`
/// generated once when the cart is first created (not at submit/retry time), so a
/// retried checkout request from a flaky connection reuses the same key and cannot
/// create a duplicate sale (R7.8) — the key travels with the cart, not the request.
class CartState {
  final List<CartItem> items;
  final int orderDiscount;
  final String? customerId;
  final String? notes;
  final String idempotencyKey;

  const CartState({
    this.items = const [],
    this.orderDiscount = 0,
    this.customerId,
    this.notes,
    required this.idempotencyKey,
  });

  int get subtotal => items.fold(0, (sum, i) => sum + i.lineTotal);
  int get total => subtotal - orderDiscount;
  bool get isEmpty => items.isEmpty;

  CartState copyWith({List<CartItem>? items, int? orderDiscount, String? customerId, String? notes}) {
    return CartState(
      items: items ?? this.items,
      orderDiscount: orderDiscount ?? this.orderDiscount,
      customerId: customerId ?? this.customerId,
      notes: notes ?? this.notes,
      idempotencyKey: idempotencyKey,
    );
  }
}

class CartController extends StateNotifier<CartState> {
  CartController() : super(CartState(idempotencyKey: const Uuid().v4()));

  void addItem(CartItem item) {
    final existingIndex = state.items.indexWhere((i) => i.variantId == item.variantId);
    if (existingIndex >= 0) {
      final existing = state.items[existingIndex];
      final updated = existing.copyWith(quantity: existing.quantity + item.quantity);
      final newItems = [...state.items];
      newItems[existingIndex] = updated;
      state = state.copyWith(items: newItems);
    } else {
      state = state.copyWith(items: [...state.items, item]);
    }
  }

  void updateQuantity(String variantId, double quantity) {
    if (quantity <= 0) {
      removeItem(variantId);
      return;
    }
    final newItems = state.items.map((i) => i.variantId == variantId ? i.copyWith(quantity: quantity) : i).toList();
    state = state.copyWith(items: newItems);
  }

  void updateLineDiscount(String variantId, int discount) {
    final newItems = state.items.map((i) => i.variantId == variantId ? i.copyWith(discount: discount) : i).toList();
    state = state.copyWith(items: newItems);
  }

  void removeItem(String variantId) {
    state = state.copyWith(items: state.items.where((i) => i.variantId != variantId).toList());
  }

  void setOrderDiscount(int discount) => state = state.copyWith(orderDiscount: discount);

  void setCustomer(String? customerId) => state = state.copyWith(customerId: customerId);

  /// Clears the cart AND rotates the idempotency key — used only after a checkout
  /// has definitively succeeded or been explicitly cancelled, never on a retry path.
  void clear() => state = CartState(idempotencyKey: const Uuid().v4());
}

final cartProvider = StateNotifierProvider<CartController, CartState>((ref) => CartController());
