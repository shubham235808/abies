/// `DiagnosticTest` row (packages/domain/prisma/schema.prisma) from
/// `GET /api/v1/labs/me/tests` → `{ tests }`.
class LabTest {
  const LabTest({
    required this.id,
    required this.code,
    required this.name,
    required this.price,
    required this.active,
    this.description,
    this.sampleType,
    this.preparationInstructions,
    this.turnaroundHours,
  });

  final String id;
  final String code;
  final String name;
  final int price;
  final bool active;
  final String? description;
  final String? sampleType;
  final String? preparationInstructions;
  final int? turnaroundHours;

  factory LabTest.fromJson(Map<String, dynamic> json) {
    return LabTest(
      id: json['id'] as String,
      code: json['code'] as String,
      name: json['name'] as String,
      price: (json['price'] as num).toInt(),
      active: json['active'] as bool? ?? true,
      description: json['description'] as String?,
      sampleType: json['sampleType'] as String?,
      preparationInstructions: json['preparationInstructions'] as String?,
      turnaroundHours: (json['turnaroundHours'] as num?)?.toInt(),
    );
  }
}

/// `DiagnosticPackage` from `GET /api/v1/labs/me/packages` → `{ packages }`,
/// with `tests: [{ test: {id, name} }]` (`listPackagesForLab` include).
class LabPackage {
  const LabPackage({
    required this.id,
    required this.name,
    required this.price,
    required this.active,
    required this.testIds,
    required this.testNames,
    this.description,
  });

  final String id;
  final String name;
  final int price;
  final bool active;
  final String? description;
  final List<String> testIds;
  final List<String> testNames;

  factory LabPackage.fromJson(Map<String, dynamic> json) {
    final links = (json['tests'] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>();
    final tests = links.map((l) => l['test'] as Map<String, dynamic>?).whereType<Map<String, dynamic>>().toList();
    return LabPackage(
      id: json['id'] as String,
      name: json['name'] as String,
      price: (json['price'] as num).toInt(),
      active: json['active'] as bool? ?? true,
      description: json['description'] as String?,
      testIds: tests.map((t) => t['id'] as String).toList(),
      testNames: tests.map((t) => t['name'] as String? ?? '').toList(),
    );
  }
}

class LabCatalogue {
  const LabCatalogue({required this.tests, required this.packages});

  final List<LabTest> tests;
  final List<LabPackage> packages;
}

/// Form input for `createTestSchema` / `updateTestSchema`
/// (catalogue.schemas.ts): code 1-50, name 1-200, price int 0-1,000,000,
/// turnaroundHours int 1-720 (optional), descriptive strings optional.
class TestInput {
  const TestInput({
    required this.code,
    required this.name,
    required this.price,
    this.description,
    this.sampleType,
    this.preparationInstructions,
    this.turnaroundHours,
    this.active,
  });

  final String code;
  final String name;
  final int price;
  final String? description;
  final String? sampleType;
  final String? preparationInstructions;
  final int? turnaroundHours;
  final bool? active;

  /// [forUpdate]: an emptied optional text field is sent as `''` (valid for
  /// `z.string().max(n)`) so it actually clears; on create it's omitted.
  /// `null` is never sent — the schema's `.optional()` rejects it.
  Map<String, dynamic> toJson({bool forUpdate = false}) {
    void text(Map<String, dynamic> m, String key, String? v) {
      final t = v?.trim() ?? '';
      if (t.isNotEmpty) {
        m[key] = t;
      } else if (forUpdate) {
        m[key] = '';
      }
    }

    final map = <String, dynamic>{'code': code.trim(), 'name': name.trim(), 'price': price};
    text(map, 'description', description);
    text(map, 'sampleType', sampleType);
    text(map, 'preparationInstructions', preparationInstructions);
    if (turnaroundHours != null) map['turnaroundHours'] = turnaroundHours;
    if (active != null) map['active'] = active;
    return map;
  }
}

/// Form input for `createPackageSchema` / `updatePackageSchema`: testIds 1-30
/// of this lab's own tests (server re-validates via `validatedOwnTestIds`).
class PackageInput {
  const PackageInput({required this.name, required this.price, required this.testIds, this.description, this.active});

  final String name;
  final int price;
  final List<String> testIds;
  final String? description;
  final bool? active;

  Map<String, dynamic> toJson({bool forUpdate = false}) {
    final desc = description?.trim() ?? '';
    return {
      'name': name.trim(),
      'price': price,
      'testIds': testIds,
      if (desc.isNotEmpty || forUpdate) 'description': desc,
      if (active != null) 'active': active,
    };
  }
}
