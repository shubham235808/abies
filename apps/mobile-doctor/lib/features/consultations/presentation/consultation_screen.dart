import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/format.dart';
import '../../../shared/widgets/state_views.dart';
import '../../../shared/widgets/status_chip.dart';
import '../domain/consultation_detail.dart';
import '../domain/recommendation.dart';
import 'consultation_controller.dart';
import 'recommend_sheets.dart';

/// The single highest-value clinical workflow: start → visit details →
/// clinical note (save, finalize) → prescriptions (draft, finalize,
/// correct) → diagnostics/Panchakarma recommendations → complete.
class ConsultationScreen extends ConsumerWidget {
  const ConsultationScreen({super.key, required this.consultationId});

  final String consultationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = consultationControllerProvider(consultationId);
    final async = ref.watch(provider);

    ref.listen(provider.select((s) => s.valueOrNull?.error), (_, error) {
      if (error != null) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(error)));
      }
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Consultation')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => e is ApiException && e.isTransportFailure
            ? OfflineStateView(onRetry: () => ref.invalidate(provider))
            : ErrorStateView(
                message: e is ApiException ? e.message : 'Could not load this consultation.',
                onRetry: () => ref.invalidate(provider),
              ),
        data: (ws) => Stack(
          children: [
            RefreshIndicator(
              onRefresh: () async => ref.invalidate(provider),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _HeaderCard(ws: ws, consultationId: consultationId),
                  const SizedBox(height: 16),
                  _SectionCard(title: 'Visit details', child: _VisitDetails(c: ws.consultation, consultationId: consultationId)),
                  _SectionCard(
                    title: 'Clinical note',
                    child: _ClinicalNoteSection(
                      key: ValueKey('note-${ws.consultation.clinicalNote?.finalizedAt}'),
                      c: ws.consultation,
                      consultationId: consultationId,
                    ),
                  ),
                  _SectionCard(title: 'Prescriptions', child: _PrescriptionsSection(c: ws.consultation, consultationId: consultationId)),
                  _SectionCard(
                    title: 'Diagnostics',
                    child: _RecommendationsSection(
                      recommendations: ws.diagnosticRecommendations,
                      empty: 'No diagnostics recommended yet.',
                      unspecified: 'Any lab / unspecified test',
                      addLabel: 'Recommend a test',
                      enabled: ws.consultation.canWriteClinicalRecords,
                      onAdd: () => showRecommendDiagnosticSheet(context, consultationId),
                    ),
                  ),
                  _SectionCard(
                    title: 'Panchakarma',
                    child: _RecommendationsSection(
                      recommendations: ws.panchakarmaRecommendations,
                      empty: 'No Panchakarma therapies recommended yet.',
                      unspecified: 'Any centre / unspecified therapy',
                      addLabel: 'Recommend a therapy',
                      enabled: ws.consultation.canWriteClinicalRecords,
                      onAdd: () => showRecommendPanchakarmaSheet(context, consultationId),
                    ),
                  ),
                ],
              ),
            ),
            if (ws.busy) const Positioned(top: 0, left: 0, right: 0, child: LinearProgressIndicator()),
          ],
        ),
      ),
    );
  }
}

Future<bool> confirmAction(BuildContext context, {required String title, required String message, required String confirm}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(confirm)),
      ],
    ),
  );
  return result ?? false;
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

class _HeaderCard extends ConsumerWidget {
  const _HeaderCard({required this.ws, required this.consultationId});

  final ConsultationWorkspace ws;
  final String consultationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = ws.consultation;
    final notifier = ref.read(consultationControllerProvider(consultationId).notifier);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: Text(c.patientName, style: Theme.of(context).textTheme.headlineSmall)),
            StatusChip(c.status),
          ],
        ),
        const SizedBox(height: 4),
        Text('${formatDateTime(c.scheduledAt)} · ${c.durationMinutes} min · ${c.isVideo ? 'Video' : 'Clinic'}'),
        if (nonEmpty(c.reasonForVisit) != null) ...[
          const SizedBox(height: 4),
          Text('Reason for visit: ${c.reasonForVisit}'),
        ],
        if (c.isVideo && ws.joinInfo != null) ...[
          const SizedBox(height: 12),
          Card(
            color: Theme.of(context).colorScheme.tertiaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(ws.joinInfo!.message),
                  const SizedBox(height: 6),
                  Text(
                    'Patient joined: ${c.patientJoinedAt != null ? formatTime(c.patientJoinedAt!) : 'not yet'}'
                    '${c.patientMobile != null ? ' · Patient mobile: ${c.patientMobile}' : ''}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 12),
        if (c.canStart)
          FilledButton.icon(
            icon: const Icon(Icons.play_arrow),
            label: const Text('Start consultation'),
            onPressed: ws.busy ? null : notifier.start,
          ),
        if (c.status == 'IN_PROGRESS')
          FilledButton.icon(
            icon: const Icon(Icons.check),
            label: const Text('Complete consultation'),
            onPressed: ws.busy
                ? null
                : () async {
                    final ok = await confirmAction(
                      context,
                      title: 'Complete this consultation?',
                      message: 'Visit details become read-only. You can still finalize the clinical note and prescriptions afterwards.',
                      confirm: 'Complete',
                    );
                    if (ok) await notifier.complete();
                  },
          ),
      ],
    );
  }
}

class _VisitDetails extends ConsumerStatefulWidget {
  const _VisitDetails({required this.c, required this.consultationId});

  final ConsultationDetail c;
  final String consultationId;

  @override
  ConsumerState<_VisitDetails> createState() => _VisitDetailsState();
}

class _VisitDetailsState extends ConsumerState<_VisitDetails> {
  late final _complaint = TextEditingController(text: widget.c.chiefComplaint ?? '');
  late final _history = TextEditingController(text: widget.c.historyOfPresentIllness ?? '');
  late final _notes = TextEditingController(text: widget.c.notes ?? '');

  @override
  void dispose() {
    _complaint.dispose();
    _history.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    if (!c.canEditVisitDetails) {
      return _ReadOnlyFields(fields: {
        'Chief complaint': c.chiefComplaint,
        'History of present illness': c.historyOfPresentIllness,
        'Notes (private to you)': c.notes,
      });
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(controller: _complaint, maxLength: 2000, maxLines: null, decoration: const InputDecoration(labelText: 'Chief complaint')),
        const SizedBox(height: 8),
        TextField(controller: _history, maxLength: 4000, maxLines: null, decoration: const InputDecoration(labelText: 'History of present illness')),
        const SizedBox(height: 8),
        TextField(
          controller: _notes,
          maxLength: 8000,
          maxLines: null,
          decoration: const InputDecoration(labelText: 'Notes', helperText: 'Your private scratch pad — never shown to the patient'),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton(
            onPressed: () async {
              final ok = await ref.read(consultationControllerProvider(widget.consultationId).notifier).saveDetails(
                    chiefComplaint: _complaint.text,
                    historyOfPresentIllness: _history.text,
                    notes: _notes.text,
                  );
              if (ok && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Visit details saved')));
              }
            },
            child: const Text('Save details'),
          ),
        ),
      ],
    );
  }
}

class _ReadOnlyFields extends StatelessWidget {
  const _ReadOnlyFields({required this.fields});

  final Map<String, String?> fields;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final entry in fields.entries)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(entry.key, style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(nonEmpty(entry.value) ?? '—'),
              ],
            ),
          ),
      ],
    );
  }
}

class _ClinicalNoteSection extends ConsumerStatefulWidget {
  const _ClinicalNoteSection({super.key, required this.c, required this.consultationId});

  final ConsultationDetail c;
  final String consultationId;

  @override
  ConsumerState<_ClinicalNoteSection> createState() => _ClinicalNoteSectionState();
}

class _ClinicalNoteSectionState extends ConsumerState<_ClinicalNoteSection> {
  late final ClinicalNote? _note = widget.c.clinicalNote;
  late final _diagnosis = TextEditingController(text: _note?.diagnosis ?? '');
  late final _plan = TextEditingController(text: _note?.treatmentPlan ?? '');
  late final _recs = TextEditingController(text: _note?.recommendations ?? '');
  late final Map<String, TextEditingController> _assessment = {
    for (final e in (_note?.ayurvedaAssessment ?? const <String, String>{}).entries) e.key: TextEditingController(text: e.value),
  };
  late String? _followUp = _note?.followUpDate;

  @override
  void dispose() {
    _diagnosis.dispose();
    _plan.dispose();
    _recs.dispose();
    for (final c in _assessment.values) {
      c.dispose();
    }
    super.dispose();
  }

  String _label(String key) => humanizeEnum(key.replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (m) => '${m[1]}_${m[2]}'));

  @override
  Widget build(BuildContext context) {
    final note = widget.c.clinicalNote;
    final notifier = ref.read(consultationControllerProvider(widget.consultationId).notifier);

    if (note == null && !widget.c.canWriteClinicalRecords) {
      return const Text('No clinical note was recorded for this visit.');
    }
    if (note != null && (note.isFinalized || !widget.c.canWriteClinicalRecords)) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ReadOnlyFields(fields: {
            for (final e in note.ayurvedaAssessment.entries) _label(e.key): e.value,
            'Diagnosis': note.diagnosis,
            'Treatment plan': note.treatmentPlan,
            'Recommendations': note.recommendations,
            'Follow-up date': note.followUpDate,
          }),
          if (note.isFinalized)
            Text('Finalized ${formatDateTime(note.finalizedAt!)} — this note is now read-only.', style: Theme.of(context).textTheme.bodySmall),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_assessment.isNotEmpty) ...[
          Text('Ayurveda assessment', style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 8),
          for (final e in _assessment.entries) ...[
            TextField(controller: e.value, maxLength: 500, decoration: InputDecoration(labelText: _label(e.key))),
            const SizedBox(height: 4),
          ],
        ],
        TextField(controller: _diagnosis, maxLength: 2000, maxLines: null, decoration: const InputDecoration(labelText: 'Diagnosis')),
        const SizedBox(height: 8),
        TextField(controller: _plan, maxLength: 4000, maxLines: null, decoration: const InputDecoration(labelText: 'Treatment plan')),
        const SizedBox(height: 8),
        TextField(controller: _recs, maxLength: 4000, maxLines: null, decoration: const InputDecoration(labelText: 'Recommendations')),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: Text('Follow-up: ${_followUp ?? 'not set'}')),
            TextButton(
              onPressed: () async {
                final now = DateTime.now();
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _followUp != null ? DateTime.tryParse(_followUp!) ?? now : now,
                  firstDate: DateTime(now.year - 1),
                  lastDate: DateTime(now.year + 3),
                );
                if (picked != null) setState(() => _followUp = isoDay(picked));
              },
              child: const Text('Pick date'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            OutlinedButton(
              onPressed: () async {
                final ok = await notifier.saveClinicalNote(
                  ayurvedaAssessment: {for (final e in _assessment.entries) e.key: e.value.text},
                  diagnosis: _diagnosis.text,
                  treatmentPlan: _plan.text,
                  recommendations: _recs.text,
                  followUpDate: _followUp,
                );
                if (ok && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Clinical note saved')));
                }
              },
              child: const Text('Save note'),
            ),
            if (note != null)
              FilledButton(
                onPressed: () async {
                  final ok = await confirmAction(
                    context,
                    title: 'Finalize clinical note?',
                    message: 'Save any changes first. Once finalized the note becomes read-only and is shared with the patient.',
                    confirm: 'Finalize',
                  );
                  if (ok) await notifier.finalizeClinicalNote();
                },
                child: const Text('Finalize note'),
              ),
          ],
        ),
        if (note == null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('Save the note once before you can finalize it.', style: Theme.of(context).textTheme.bodySmall),
          ),
      ],
    );
  }
}

class _PrescriptionsSection extends ConsumerWidget {
  const _PrescriptionsSection({required this.c, required this.consultationId});

  final ConsultationDetail c;
  final String consultationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(consultationControllerProvider(consultationId).notifier);
    final writable = c.canWriteClinicalRecords;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (c.prescriptions.isEmpty) const Text('No prescriptions yet.'),
        for (final p in c.prescriptions)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    StatusChip(p.status),
                    const Spacer(),
                    if (p.supersedesId != null) Text('Correction', style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
                const SizedBox(height: 8),
                for (final item in p.items)
                  Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('• ${item.summary}')),
                if (nonEmpty(p.doctorNotes) != null) Text('Notes: ${p.doctorNotes}', style: Theme.of(context).textTheme.bodySmall),
                if (writable && p.isDraft)
                  Wrap(
                    spacing: 8,
                    children: [
                      TextButton(
                        onPressed: () => context.push('/consultation/$consultationId/prescription', extra: p.id),
                        child: const Text('Edit'),
                      ),
                      FilledButton(
                        onPressed: () async {
                          final ok = await confirmAction(
                            context,
                            title: 'Finalize prescription?',
                            message: 'A finalized prescription is sent to the patient and can no longer be edited — '
                                'any later change has to be made as a correction.',
                            confirm: 'Finalize',
                          );
                          if (ok) await notifier.finalizePrescription(p.id);
                        },
                        child: const Text('Finalize'),
                      ),
                    ],
                  ),
                if (writable && p.isFinalized)
                  TextButton(
                    onPressed: () async {
                      final ok = await confirmAction(
                        context,
                        title: 'Correct this prescription?',
                        message: 'This creates a new draft copy for you to edit and marks this one as superseded.',
                        confirm: 'Create correction',
                      );
                      if (!ok) return;
                      final newId = await notifier.correctPrescription(p.id);
                      if (newId != null && context.mounted) {
                        context.push('/consultation/$consultationId/prescription', extra: newId);
                      }
                    },
                    child: const Text('Correct this prescription'),
                  ),
              ],
            ),
          ),
        if (writable)
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.add),
              label: const Text('New prescription'),
              onPressed: () => context.push('/consultation/$consultationId/prescription'),
            ),
          ),
      ],
    );
  }
}

class _RecommendationsSection extends StatelessWidget {
  const _RecommendationsSection({
    required this.recommendations,
    required this.empty,
    required this.unspecified,
    required this.addLabel,
    required this.enabled,
    required this.onAdd,
  });

  final List<Recommendation> recommendations;
  final String empty;
  final String unspecified;
  final String addLabel;
  final bool enabled;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (recommendations.isEmpty) Text(empty),
        for (final r in recommendations)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(r.itemName ?? unspecified),
            subtitle: Text([
              if (nonEmpty(r.clinicalReason) != null) r.clinicalReason!,
              if (r.sessionCountRecommended != null) '${r.sessionCountRecommended} session(s) recommended',
            ].join('\n')),
            trailing: StatusChip(r.status),
          ),
        if (enabled)
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(icon: const Icon(Icons.add), label: Text(addLabel), onPressed: onAdd),
          ),
      ],
    );
  }
}
