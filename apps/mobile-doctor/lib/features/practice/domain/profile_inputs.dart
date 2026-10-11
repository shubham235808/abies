import 'doctor_profile.dart';

/// Write-side inputs for the `/api/v1/doctors/me*` routes, each with a
/// client-side mirror of the backend's zod schema
/// (packages/domain/src/modules/doctors/doctors.schemas.ts) so the doctor
/// gets field-level messages without a round trip. The backend still
/// validates everything — these are a convenience, never the gate.

/// Raw text from the profile form, one field per `updateDoctorProfileSchema`
/// key the web ProfileForm (apps/partner-web/.../doctor/profile/
/// profile-form.tsx) edits. Numbers and comma-separated lists stay strings
/// here, exactly like the web form's `FormValues`, and are converted in
/// [toPatchBody].
class ProfileFormInput {
  const ProfileFormInput({
    this.title = '',
    this.firstName = '',
    this.lastName = '',
    this.gender = '',
    this.bio = '',
    this.registrationCouncil = '',
    this.registrationNumber = '',
    this.registrationYear = '',
    this.primaryQualification = '',
    this.highestQualification = '',
    this.graduationInstitution = '',
    this.graduationYear = '',
    this.yearsExperience = '',
    this.specialties = '',
    this.languages = '',
    this.video = false,
    this.clinic = false,
    this.videoFee = '',
    this.clinicFee = '',
  });

  factory ProfileFormInput.fromProfile(DoctorProfile p) => ProfileFormInput(
        title: p.title,
        firstName: p.firstName ?? '',
        lastName: p.lastName ?? '',
        gender: p.gender ?? '',
        bio: p.bio ?? '',
        registrationCouncil: p.registrationCouncil ?? '',
        registrationNumber: p.registrationNumber ?? '',
        registrationYear: p.registrationYear?.toString() ?? '',
        primaryQualification: p.primaryQualification ?? '',
        highestQualification: p.highestQualification ?? '',
        graduationInstitution: p.graduationInstitution ?? '',
        graduationYear: p.graduationYear?.toString() ?? '',
        yearsExperience: p.yearsExperience?.toString() ?? '',
        specialties: p.specialties.join(', '),
        languages: p.languages.join(', '),
        video: p.consultationModes.contains('VIDEO'),
        clinic: p.consultationModes.contains('CLINIC'),
        videoFee: p.videoFee?.toString() ?? '',
        clinicFee: p.clinicFee?.toString() ?? '',
      );

  final String title;
  final String firstName;
  final String lastName;
  final String gender;
  final String bio;
  final String registrationCouncil;
  final String registrationNumber;
  final String registrationYear;
  final String primaryQualification;
  final String highestQualification;
  final String graduationInstitution;
  final String graduationYear;
  final String yearsExperience;

  /// Comma-separated, as on the web form.
  final String specialties;
  final String languages;
  final bool video;
  final bool clinic;
  final String videoFee;
  final String clinicFee;

  static List<String> splitList(String raw) => raw.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();

  /// Field key → message, empty when valid. Keys match the
  /// `updateDoctorProfileSchema` field names.
  Map<String, String> validate() {
    final errors = <String, String>{};
    void maxLen(String key, String value, int max) {
      if (value.trim().length > max) errors[key] = 'Must be at most $max characters';
    }

    void intRange(String key, String value, int min, int max) {
      final v = value.trim();
      if (v.isEmpty) return;
      final n = int.tryParse(v);
      if (n == null) {
        errors[key] = 'Enter a whole number';
      } else if (n < min || n > max) {
        errors[key] = 'Must be between $min and $max';
      }
    }

    maxLen('title', title, 20);
    maxLen('firstName', firstName, 100);
    maxLen('lastName', lastName, 100);
    maxLen('gender', gender, 50);
    maxLen('bio', bio, 3000);
    maxLen('registrationCouncil', registrationCouncil, 200);
    maxLen('registrationNumber', registrationNumber, 100);
    maxLen('primaryQualification', primaryQualification, 200);
    maxLen('highestQualification', highestQualification, 200);
    maxLen('graduationInstitution', graduationInstitution, 200);
    intRange('registrationYear', registrationYear, 1950, 2100);
    intRange('graduationYear', graduationYear, 1950, 2100);
    intRange('yearsExperience', yearsExperience, 0, 80);
    if (video) intRange('videoFee', videoFee, 0, 1000000);
    if (clinic) intRange('clinicFee', clinicFee, 0, 1000000);

    final specs = splitList(specialties);
    if (specs.length > 20) {
      errors['specialties'] = 'At most 20 specialties';
    } else if (specs.any((s) => s.length > 100)) {
      errors['specialties'] = 'Each speciality must be at most 100 characters';
    }
    final langs = splitList(languages);
    if (langs.length > 20) {
      errors['languages'] = 'At most 20 languages';
    } else if (langs.any((s) => s.length > 50)) {
      errors['languages'] = 'Each language must be at most 50 characters';
    }
    return errors;
  }

  /// Same cleaning as the web form's `onSubmit`: empty strings are omitted
  /// (the schema's `min(1)` would reject them, and an omitted key means
  /// "leave unchanged"), lists are always sent, and a fee is only sent for an
  /// enabled consultation mode.
  Map<String, dynamic> toPatchBody() {
    String? text(String v) => v.trim().isEmpty ? null : v.trim();
    int? number(String v) => int.tryParse(v.trim());
    final raw = <String, dynamic>{
      'title': text(title),
      'firstName': text(firstName),
      'lastName': text(lastName),
      'gender': text(gender),
      'bio': text(bio),
      'registrationCouncil': text(registrationCouncil),
      'registrationNumber': text(registrationNumber),
      'registrationYear': number(registrationYear),
      'primaryQualification': text(primaryQualification),
      'highestQualification': text(highestQualification),
      'graduationInstitution': text(graduationInstitution),
      'graduationYear': number(graduationYear),
      'yearsExperience': number(yearsExperience),
      'specialties': splitList(specialties),
      'languages': splitList(languages),
      'consultationModes': [if (video) 'VIDEO', if (clinic) 'CLINIC'],
      'videoFee': video ? number(videoFee) : null,
      'clinicFee': clinic ? number(clinicFee) : null,
    };
    raw.removeWhere((_, v) => v == null);
    return raw;
  }
}

/// `createClinicSchema` (POST) / `updateClinicSchema` = `.partial()` (PATCH).
/// latitude/longitude are accepted by the schema but the web ClinicsManager
/// never collects them, so neither does this app.
class ClinicInput {
  const ClinicInput({
    required this.name,
    required this.addressLine1,
    this.addressLine2 = '',
    required this.city,
    required this.state,
    required this.postalCode,
    this.phone = '',
    this.active = true,
  });

  factory ClinicInput.fromClinic(DoctorClinic c) => ClinicInput(
        name: c.name,
        addressLine1: c.addressLine1,
        addressLine2: c.addressLine2 ?? '',
        city: c.city,
        state: c.state,
        postalCode: c.postalCode,
        phone: c.phone ?? '',
        active: c.active,
      );

  final String name;
  final String addressLine1;
  final String addressLine2;
  final String city;
  final String state;
  final String postalCode;
  final String phone;
  final bool active;

  Map<String, String> validate() {
    final errors = <String, String>{};
    void required(String key, String value, int max) {
      final v = value.trim();
      if (v.isEmpty) {
        errors[key] = 'Required';
      } else if (v.length > max) {
        errors[key] = 'Must be at most $max characters';
      }
    }

    required('name', name, 200);
    required('addressLine1', addressLine1, 300);
    required('city', city, 100);
    required('state', state, 100);
    required('postalCode', postalCode, 12);
    if (addressLine2.trim().length > 300) errors['addressLine2'] = 'Must be at most 300 characters';
    if (phone.trim().length > 20) errors['phone'] = 'Must be at most 20 characters';
    return errors;
  }

  /// Full body — valid for both POST (all required keys present) and PATCH.
  /// Optional text fields are omitted when blank: the schema has no
  /// `nullable()`, so a clinic's existing addressLine2/phone can't be cleared
  /// through this route (same limitation as the web).
  Map<String, dynamic> toJson() => {
        'name': name.trim(),
        'addressLine1': addressLine1.trim(),
        if (addressLine2.trim().isNotEmpty) 'addressLine2': addressLine2.trim(),
        'city': city.trim(),
        'state': state.trim(),
        'postalCode': postalCode.trim(),
        if (phone.trim().isNotEmpty) 'phone': phone.trim(),
        'active': active,
      };
}

/// A file picked for `POST /api/v1/doctors/me/documents` (multipart: `type`,
/// `file`). The allow-list and size cap mirror packages/domain/src/lib/
/// storage.ts `assertUploadAllowed`'s defaults — PDF/JPEG/PNG only (no WebP)
/// and `UPLOAD_MAX_BYTES` (10 MiB default in lib/env.ts). Checking here
/// matters more than usual: the backend throws a plain `Error` for these,
/// which errorResponse() turns into an opaque 500 "Something went wrong".
class DocumentUpload {
  const DocumentUpload({required this.path, required this.filename, required this.mimeType, required this.sizeBytes});

  final String path;
  final String filename;
  final String mimeType;
  final int sizeBytes;

  static const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
  static const maxBytes = 10 * 1024 * 1024;

  /// Null when the extension isn't one the server accepts.
  static String? mimeTypeFor(String filename) {
    final dot = filename.lastIndexOf('.');
    if (dot < 0) return null;
    return switch (filename.substring(dot + 1).toLowerCase()) {
      'pdf' => 'application/pdf',
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      _ => null,
    };
  }

  /// Null when acceptable; otherwise the message to show.
  String? validate({required String type}) {
    if (!doctorDocumentTypes.containsKey(type)) return 'Choose a document type';
    if (mimeTypeFor(filename) == null) return 'Only PDF, JPG or PNG files are accepted.';
    if (sizeBytes <= 0) return 'That file is empty.';
    if (sizeBytes > maxBytes) return 'Files must be 10 MB or smaller.';
    return null;
  }
}
