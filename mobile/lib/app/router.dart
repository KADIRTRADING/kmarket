import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'providers/auth_provider.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/store_application_screen.dart';
import '../features/home/home_shell.dart';
import '../features/pos/pos_screen.dart';
import '../features/pos/checkout_result_screen.dart';
import '../features/inventory/inventory_screen.dart';
import '../features/inventory/product_form_screen.dart';
import '../features/purchasing/purchasing_screen.dart';
import '../features/customers/customers_screen.dart';
import '../features/finance/finance_screen.dart';
import '../features/reports/reports_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/shift/shift_screen.dart';
import '../features/pending/store_pending_screen.dart';

/// Central route table. Redirect logic mirrors (but does not replace) backend
/// enforcement: an unauthenticated user is sent to /login; an authenticated user
/// whose store is not ACTIVE is sent to /store-pending instead of the POS home,
/// matching R3.2's backend-side block on operational endpoints.
final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/login',
    redirect: (context, state) {
      final loggingIn = state.matchedLocation == '/login' || state.matchedLocation == '/register-store';
      if (auth.status == AuthStatus.unknown) return null;

      if (auth.status == AuthStatus.unauthenticated) {
        return loggingIn ? null : '/login';
      }

      // Authenticated.
      if (loggingIn) return '/home';
      if (!auth.isStoreActive && state.matchedLocation != '/store-pending') {
        return '/store-pending';
      }
      if (auth.isStoreActive && state.matchedLocation == '/store-pending') {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register-store', builder: (context, state) => const StoreApplicationScreen()),
      GoRoute(path: '/store-pending', builder: (context, state) => const StorePendingScreen()),
      GoRoute(
        path: '/home',
        builder: (context, state) => const HomeShell(),
        routes: [
          GoRoute(path: 'pos', builder: (context, state) => const PosScreen()),
          GoRoute(path: 'checkout-result/:saleId', builder: (context, state) => CheckoutResultScreen(saleId: state.pathParameters['saleId']!)),
          GoRoute(path: 'shift', builder: (context, state) => const ShiftScreen()),
          GoRoute(path: 'inventory', builder: (context, state) => const InventoryScreen()),
          GoRoute(path: 'inventory/new-product', builder: (context, state) => const ProductFormScreen()),
          GoRoute(path: 'purchasing', builder: (context, state) => const PurchasingScreen()),
          GoRoute(path: 'customers', builder: (context, state) => const CustomersScreen()),
          GoRoute(path: 'finance', builder: (context, state) => const FinanceScreen()),
          GoRoute(path: 'reports', builder: (context, state) => const ReportsScreen()),
          GoRoute(path: 'settings', builder: (context, state) => const SettingsScreen()),
        ],
      ),
    ],
  );
});
