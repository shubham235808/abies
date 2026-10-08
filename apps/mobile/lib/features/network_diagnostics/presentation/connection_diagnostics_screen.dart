import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../data/connection_diagnostics_service.dart';
import '../domain/certificate_check_result.dart';

/// Reachable from the sign-in screen ("Having trouble connecting?") —
/// deliberately not hidden behind a gesture or debug flag. Nothing shown
/// here is sensitive (a public TLS certificate's subject/issuer/validity
/// dates are, by definition, visible to anyone who connects — that's what
/// a certificate is for), so there's no reason to make it harder to reach
/// than any other support screen.
class ConnectionDiagnosticsScreen extends ConsumerStatefulWidget {
  const ConnectionDiagnosticsScreen({super.key});

  @override
  ConsumerState<ConnectionDiagnosticsScreen> createState() => _ConnectionDiagnosticsScreenState();
}

class _ConnectionDiagnosticsScreenState extends ConsumerState<ConnectionDiagnosticsScreen> {
  ConnectionCheckResult? _result;
  bool _running = false;

  Future<void> _run() async {
    setState(() {
      _running = true;
      _result = null;
    });
    final host = Uri.parse(ref.read(appEnvProvider).baseUrl).host;
    final result = await ConnectionDiagnosticsService().check(host);
    if (!mounted) return;
    setState(() {
      _result = result;
      _running = false;
    });
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Connection diagnostics')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              'This checks whether your current network is actually reaching ABIES securely, '
              'or whether something in between (your Wi-Fi, a firewall, your mobile carrier) is '
              "intercepting the connection. It doesn't send or check any account information.",
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            if (_running) const Center(child: CircularProgressIndicator()),
            if (!_running && _result != null) _ResultCard(result: _result!),
            const SizedBox(height: 24),
            OutlinedButton(onPressed: _running ? null : _run, child: const Text('Run again')),
          ],
        ),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.result});

  final ConnectionCheckResult result;

  @override
  Widget build(BuildContext context) {
    final (icon, color, title, explanation) = switch (result.status) {
      ConnectionCheckStatus.trusted => (
          Icons.verified_user,
          Colors.green,
          'Secure connection confirmed',
          'Your connection to ${result.host} is genuine and not being intercepted.',
        ),
      ConnectionCheckStatus.untrusted => (
          Icons.warning_amber_rounded,
          Colors.orange,
          'This connection is being intercepted',
          'Something on your current network — a Wi-Fi gateway, a firewall, or your mobile '
              "carrier's own filtering — is substituting its own certificate instead of passing "
              'the real one through. This is not a problem with the ABIES app or servers. Try a '
              'different network (e.g. switch between Wi-Fi and mobile data) and run this again.',
        ),
      ConnectionCheckStatus.networkFailure => (
          Icons.cloud_off,
          Colors.red,
          'Could not reach the server',
          "Couldn't make any connection at all — check your internet connection and try again.",
        ),
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: color),
                const SizedBox(width: 12),
                Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
              ],
            ),
            const SizedBox(height: 8),
            Text(explanation),
            if (result.certificate != null) ...[
              const Divider(height: 32),
              Text('Certificate details', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              _DetailRow('Subject', result.certificate!.subject),
              _DetailRow('Issuer', result.certificate!.issuer),
              _DetailRow('Valid from', result.certificate!.validFrom.toIso8601String()),
              _DetailRow('Valid to', result.certificate!.validTo.toIso8601String()),
              _DetailRow('SHA-1 fingerprint', result.certificate!.sha1Fingerprint),
              if (!result.certificate!.issuerLooksLikeLetsEncrypt) ...[
                const SizedBox(height: 8),
                Text(
                  "The issuer above doesn't look like Let's Encrypt, which is what ABIES's real "
                  'certificate is issued by — that confirms something else is presenting its own '
                  'certificate on this network.',
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
            ],
            if (result.errorMessage != null) ...[
              const SizedBox(height: 8),
              _DetailRow('Technical detail', result.errorMessage!),
            ],
            const SizedBox(height: 16),
            OutlinedButton.icon(
              icon: const Icon(Icons.copy),
              label: const Text('Copy details for support'),
              onPressed: () {
                final cert = result.certificate;
                final text = [
                  'ABIES connection diagnostics',
                  'Host: ${result.host}:${result.port}',
                  'Status: ${result.status.name}',
                  if (cert != null) ...[
                    'Subject: ${cert.subject}',
                    'Issuer: ${cert.issuer}',
                    'Valid: ${cert.validFrom.toIso8601String()} to ${cert.validTo.toIso8601String()}',
                    'SHA-1: ${cert.sha1Fingerprint}',
                  ],
                  if (result.errorMessage != null) 'Error: ${result.errorMessage}',
                ].join('\n');
                Clipboard.setData(ClipboardData(text: text));
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Copied to clipboard')));
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 110, child: Text(label, style: Theme.of(context).textTheme.labelMedium)),
          Expanded(child: SelectableText(value, style: Theme.of(context).textTheme.bodySmall)),
        ],
      ),
    );
  }
}
