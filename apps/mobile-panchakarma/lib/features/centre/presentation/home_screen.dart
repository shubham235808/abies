import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/formatting.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/centre_models.dart';
import 'catalogue_screens.dart';
import 'dashboard_controller.dart';
import 'profile_screen.dart';
import 'widgets.dart';

/// Signed-in shell: Overview / Bookings / Therapies / Therapists / Profile —
/// the same sections as the partner web portal's nav
/// (apps/partner-web/src/app/partner/panchakarma-centre/layout.tsx), minus
/// Earnings (out of this MVP).
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _index = 0;

  static const _titles = ['Overview', 'Bookings', 'Therapies', 'Therapists', 'Centre profile'];

  Future<void> _confirmSignOut() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Stay')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(authControllerProvider.notifier).signOut();
    } catch (_) {
      if (mounted) showMessage(context, 'Could not sign out. Check your connection and try again.', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index]),
        actions: [IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: _confirmSignOut)],
      ),
      body: IndexedStack(
        index: _index,
        children: const [
          _OverviewTab(),
          _BookingsTab(),
          TherapiesTab(),
          TherapistsTab(),
          ProfileTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Overview'),
          NavigationDestination(icon: Icon(Icons.event_note_outlined), selectedIcon: Icon(Icons.event_note), label: 'Bookings'),
          NavigationDestination(icon: Icon(Icons.spa_outlined), selectedIcon: Icon(Icons.spa), label: 'Therapies'),
          NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Therapists'),
          NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'Profile'),
        ],
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const [
        LoadingSkeleton(height: 80),
        SizedBox(height: 12),
        LoadingSkeleton(height: 64),
        SizedBox(height: 12),
        LoadingSkeleton(height: 64),
      ],
    );
  }
}

class _OverviewTab extends ConsumerWidget {
  const _OverviewTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardControllerProvider);
    return async.when(
      loading: () => const _Loading(),
      error: (e, _) => errorView(e, () => ref.invalidate(dashboardControllerProvider)),
      data: (dash) => RefreshIndicator(
        onRefresh: () => ref.read(dashboardControllerProvider.notifier).refresh(),
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            _CentreHeader(centre: dash.centre),
            if (dash.centre.isApproved) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _Metric(label: "Today's sessions", value: dash.todaysSessions.length),
                    _Metric(label: 'Upcoming', value: dash.upcomingSessions.length),
                    _Metric(label: 'Awaiting scheduling', value: dash.awaitingScheduling.length),
                    _Metric(label: 'Active courses', value: dash.activeCourses.length),
                    _Metric(label: 'Completed', value: dash.completed.length),
                  ],
                ),
              ),
              const SectionHeader("Today's sessions"),
              if (dash.todaysSessions.isEmpty)
                const _InlineEmpty('No sessions scheduled for today.')
              else
                for (final entry in dash.todaysSessions)
                  _BookingTile(
                    booking: entry.booking,
                    subtitle: '${entry.booking.therapyName} — Session ${entry.session.sessionNumber}',
                    trailing: Text(formatTime(entry.session.scheduledAt)),
                  ),
              const SectionHeader('Awaiting scheduling'),
              if (dash.awaitingScheduling.isEmpty)
                const _InlineEmpty('Every active booking has all its sessions scheduled.')
              else
                for (final b in dash.awaitingScheduling)
                  _BookingTile(booking: b, subtitle: b.therapyName, trailing: Text('${b.sessions.length}/${b.sessionCount} scheduled')),
              const SectionHeader('Upcoming sessions'),
              if (dash.upcomingSessions.isEmpty)
                const _InlineEmpty('Nothing scheduled after today yet.')
              else
                for (final entry in dash.upcomingSessions.take(10))
                  _BookingTile(
                    booking: entry.booking,
                    subtitle: '${entry.booking.therapyName} — Session ${entry.session.sessionNumber}',
                    trailing: Text(formatDateTime(entry.session.scheduledAt), textAlign: TextAlign.end),
                  ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CentreHeader extends StatelessWidget {
  const _CentreHeader({required this.centre});

  final CentreProfile centre;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (label, message) = switch (centre.verificationStatus) {
      CentreVerificationStatus.approved => ('Approved', null),
      CentreVerificationStatus.draft =>
        ('Draft', 'Complete your centre profile and submit it for verification from the Profile tab. Add your therapies too.'),
      CentreVerificationStatus.submitted ||
      CentreVerificationStatus.underReview =>
        ('Under review', 'Your application is with the ABIES verification team. You’ll be notified once it’s reviewed.'),
      CentreVerificationStatus.rejected => (
          'Rejected',
          'Your last application was rejected${centre.rejectionReason != null ? ': ${centre.rejectionReason}' : '.'} Update your details in the Profile tab and resubmit.'
        ),
      CentreVerificationStatus.suspended => (
          'Suspended',
          'Your account has been suspended${centre.rejectionReason != null ? ': ${centre.rejectionReason}' : '.'} Contact ABIES support.'
        ),
      CentreVerificationStatus.unknown => ('Unknown', null),
    };
    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(centre.name ?? 'Your centre application', style: theme.textTheme.titleLarge)),
                Chip(label: Text(label)),
              ],
            ),
            if (centre.city != null) Text([centre.city, centre.state].whereType<String>().join(', ')),
            if (message != null) ...[const SizedBox(height: 8), Text(message)],
          ],
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: 160,
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$value', style: theme.textTheme.headlineSmall?.copyWith(color: theme.colorScheme.primary)),
              Text(label, style: theme.textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _InlineEmpty extends StatelessWidget {
  const _InlineEmpty(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Text(message, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
    );
  }
}

class _BookingTile extends StatelessWidget {
  const _BookingTile({required this.booking, required this.subtitle, this.trailing});

  final CentreBooking booking;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
        title: Text(booking.patientName),
        subtitle: Text(subtitle),
        trailing: trailing,
        onTap: () => context.push('/bookings/${booking.id}'),
      ),
    );
  }
}

enum _BookingFilter { active, completed, cancelled, all }

class _BookingsTab extends ConsumerStatefulWidget {
  const _BookingsTab();

  @override
  ConsumerState<_BookingsTab> createState() => _BookingsTabState();
}

class _BookingsTabState extends ConsumerState<_BookingsTab> {
  _BookingFilter _filter = _BookingFilter.active;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(dashboardControllerProvider);
    return async.when(
      loading: () => const _Loading(),
      error: (e, _) => errorView(e, () => ref.invalidate(dashboardControllerProvider)),
      data: (dash) {
        if (!dash.centre.isApproved) {
          return const EmptyStateView(message: 'Bookings appear here once your centre is approved.', icon: Icons.hourglass_empty);
        }
        final bookings = switch (_filter) {
          _BookingFilter.active => dash.activeBookings,
          _BookingFilter.completed => dash.completed,
          _BookingFilter.cancelled => dash.bookings.where((b) => b.status == BookingStatus.cancelled).toList(),
          _BookingFilter.all => dash.bookings,
        };
        return RefreshIndicator(
          onRefresh: () => ref.read(dashboardControllerProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: SegmentedButton<_BookingFilter>(
                  segments: const [
                    ButtonSegment(value: _BookingFilter.active, label: Text('Active')),
                    ButtonSegment(value: _BookingFilter.completed, label: Text('Done')),
                    ButtonSegment(value: _BookingFilter.cancelled, label: Text('Cancelled')),
                    ButtonSegment(value: _BookingFilter.all, label: Text('All')),
                  ],
                  selected: {_filter},
                  showSelectedIcon: false,
                  onSelectionChanged: (s) => setState(() => _filter = s.first),
                ),
              ),
              if (bookings.isEmpty)
                const Padding(padding: EdgeInsets.only(top: 48), child: EmptyStateView(message: 'No bookings here.'))
              else
                for (final b in bookings)
                  Card(
                    margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: ListTile(
                      title: Text(b.patientName),
                      subtitle: Text('${b.therapyName}\n${b.attendedCount}/${b.sessionCount} sessions attended'),
                      isThreeLine: true,
                      trailing: BookingStatusChip(status: b.status),
                      onTap: () => context.push('/bookings/${b.id}'),
                    ),
                  ),
            ],
          ),
        );
      },
    );
  }
}
