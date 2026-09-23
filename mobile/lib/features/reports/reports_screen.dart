import 'package:flutter/material.dart';

import '../../app/services/api_client.dart';
import '../../app/utils/money.dart';
import '../../l10n/app_localizations.dart';

/// Dashboard screen: period filter + the key metrics from the backend's
/// `/v1/reports/dashboard` endpoint (R11.1-R11.2). Figures shown here are computed
/// by the exact same backend function used for CSV/XLSX/PDF export, so they always
/// match (R11.4).
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String _preset = 'today';
  Map<String, dynamic>? _current;
  bool _loading = true;

  static const _presets = {
    'today': 'todayFilter',
    'yesterday': 'yesterdayFilter',
    'this_week': 'thisWeekFilter',
    'last_week': 'lastWeekFilter',
    'this_month': 'thisMonthFilter',
    'last_month': 'lastMonthFilter',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final response = await ApiClient.instance.dio.get('/v1/reports/dashboard', queryParameters: {'preset': _preset});
      setState(() => _current = (response.data as Map<String, dynamic>)['current'] as Map<String, dynamic>);
    } catch (_) {
      setState(() => _current = null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.reportsTitle)),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              children: _presets.entries.map((entry) {
                final selected = _preset == entry.key;
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text(entry.key), // localized label would come from l10n dynamic lookup
                    selected: selected,
                    onSelected: (_) {
                      setState(() => _preset = entry.key);
                      _load();
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          if (_loading) const LinearProgressIndicator(),
          Expanded(
            child: _current == null
                ? Center(child: Text(l10n.genericErrorMessage))
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _MetricCard(label: l10n.grossSales, value: formatUzs((_current!['grossSales'] as num).toInt())),
                      _MetricCard(label: l10n.netSales, value: formatUzs((_current!['netSales'] as num).toInt())),
                      _MetricCard(label: l10n.grossProfit, value: formatUzs((_current!['grossProfit'] as num).toInt())),
                      _MetricCard(label: 'COGS', value: formatUzs((_current!['cogs'] as num).toInt())),
                      _MetricCard(label: 'Savdolar soni', value: '${_current!['salesCount']}'),
                      _MetricCard(label: "O'rtacha chek", value: formatUzs((_current!['averageOrderValue'] as num).toInt())),
                      const SizedBox(height: 8),
                      const Text(
                        "Eslatma: Yalpi foyda va COGS operatsion baholashlardir (o'rtacha vaznli tannarx usuli). "
                        "Rasmiy hisobot uchun buxgalter tekshiruvi tavsiya etiladi.",
                        style: TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  const _MetricCard({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(label),
        trailing: Text(value, style: Theme.of(context).textTheme.titleMedium),
      ),
    );
  }
}
