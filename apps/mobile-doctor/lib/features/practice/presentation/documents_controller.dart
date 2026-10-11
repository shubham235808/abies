import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../domain/doctor_profile.dart';
import '../domain/profile_inputs.dart';
import 'practice_providers.dart';
import 'profile_management.dart';

/// Credential documents — the mobile port of the web DocumentsManager
/// (apps/partner-web/.../doctor/documents/documents-manager.tsx).
///
/// Lock rules mirror doctors.service.ts `addDocument`/`removeDocument`:
/// PROFILE_PHOTO can always be changed; every other type only in
/// DRAFT/REJECTED, or while any document is flagged RESUBMISSION_REQUIRED.
class DocumentsController extends ProfileWorkController {
  @override
  ProviderBase<AsyncValue<ProfileWorkState>> get selfProvider => documentsControllerProvider;

  static const lockedMessage =
      'Documents can be changed only while the application is in Draft or Rejected state, or a document has been flagged for resubmission';

  /// Types the doctor may upload right now, in the web's display order.
  List<String> uploadableTypes() {
    final profile = state.valueOrNull?.profile;
    if (profile == null) return const [];
    return doctorDocumentTypes.keys.where(profile.canChangeDocumentOfType).toList();
  }

  bool canRemove(DoctorDocument document) => state.valueOrNull?.profile.canChangeDocumentOfType(document.type) ?? false;

  Future<bool> upload({required String type, required DocumentUpload file}) async {
    final current = state.valueOrNull;
    if (current == null) return false;
    if (!current.profile.canChangeDocumentOfType(type)) return reject(error: lockedMessage);
    final invalid = file.validate(type: type);
    if (invalid != null) return reject(error: invalid);
    return mutate(
      () async {
        await ref.read(doctorApiProvider).uploadDocument(type: type, file: file);
        return null;
      },
      successMessage: 'Document uploaded.',
    );
  }

  Future<bool> remove(DoctorDocument document) async {
    if (!canRemove(document)) return reject(error: 'Documents cannot be removed while verification is in progress or approved');
    return mutate(
      () async {
        await ref.read(doctorApiProvider).removeDocument(document.id);
        return null;
      },
      successMessage: 'Document removed.',
    );
  }

  /// Short-lived signed URL for viewing; null (with the error surfaced) on
  /// failure.
  Future<String?> downloadUrl(String id) async {
    try {
      return await ref.read(doctorApiProvider).documentDownloadUrl(id);
    } on ApiException catch (e) {
      reject(error: e.message);
      return null;
    }
  }
}

final documentsControllerProvider = AutoDisposeAsyncNotifierProvider<DocumentsController, ProfileWorkState>(DocumentsController.new);
