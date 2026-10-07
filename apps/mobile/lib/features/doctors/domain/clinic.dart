/// Matches `DoctorClinic` (`packages/domain/prisma/schema.prisma`), as
/// embedded in the public doctor search/detail response's `clinics[]`
/// (`publicDoctor()` in `packages/domain/src/modules/doctors/doctors.service.ts`
/// — only active clinics are ever included there).
class Clinic {
  const Clinic({
    required this.id,
    required this.name,
    required this.addressLine1,
    this.addressLine2,
    required this.city,
    required this.state,
    required this.postalCode,
    this.phone,
  });

  final String id;
  final String name;
  final String addressLine1;
  final String? addressLine2;
  final String city;
  final String state;
  final String postalCode;
  final String? phone;

  String get fullAddress => [addressLine1, addressLine2, city, state, postalCode]
      .where((p) => p != null && p.isNotEmpty)
      .join(', ');

  factory Clinic.fromJson(Map<String, dynamic> json) {
    return Clinic(
      id: json['id'] as String,
      name: json['name'] as String,
      addressLine1: json['addressLine1'] as String? ?? '',
      addressLine2: json['addressLine2'] as String?,
      city: json['city'] as String? ?? '',
      state: json['state'] as String? ?? '',
      postalCode: json['postalCode'] as String? ?? '',
      phone: json['phone'] as String?,
    );
  }
}
