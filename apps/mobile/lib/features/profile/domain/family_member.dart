/// Matches `FamilyMember` in `packages/domain/prisma/schema.prisma`.
/// `relation` is one of PARENT/SPOUSE/CHILD/DEPENDENT/OTHER
/// (`FamilyRelation` enum) — kept as a raw string here rather than a Dart
/// enum so an added backend value never breaks JSON parsing; the UI maps it
/// to a label.
class FamilyMember {
  const FamilyMember({required this.id, required this.name, required this.relation, this.dateOfBirth, this.gender, this.mobile});

  final String id;
  final String name;
  final String relation;
  final String? dateOfBirth;
  final String? gender;
  final String? mobile;

  factory FamilyMember.fromJson(Map<String, dynamic> json) {
    return FamilyMember(
      id: json['id'] as String,
      name: json['name'] as String,
      relation: json['relation'] as String,
      dateOfBirth: json['dateOfBirth'] as String?,
      gender: json['gender'] as String?,
      mobile: json['mobile'] as String?,
    );
  }
}

const familyRelations = ['PARENT', 'SPOUSE', 'CHILD', 'DEPENDENT', 'OTHER'];
