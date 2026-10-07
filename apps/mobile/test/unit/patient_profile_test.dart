import 'package:abies_mobile/features/profile/domain/patient_profile.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('MyProfile.fromJson', () {
    test('parses the nested familyMembers the real GET /patients/me response includes', () {
      final json = {
        'profile': {
          'firstName': 'Asha',
          'lastName': 'Rao',
          'preferredLanguage': 'English',
          'allergies': ['Pollen'],
          'familyMembers': [
            {'id': 'fm1', 'name': 'Ravi Rao', 'relation': 'SPOUSE'},
          ],
        },
        'email': 'asha@example.test',
        'mobile': '+919876543210',
      };

      final my = MyProfile.fromJson(json);

      expect(my.profile.displayName, 'Asha Rao');
      expect(my.profile.allergies, ['Pollen']);
      expect(my.profile.familyMembers, hasLength(1));
      expect(my.profile.familyMembers.single.name, 'Ravi Rao');
      expect(my.mobile, '+919876543210');
    });

    test('defaults preferredLanguage and empty collections when the profile is bare', () {
      final json = {
        'profile': <String, dynamic>{},
        'email': null,
        'mobile': '+919876543210',
      };

      final my = MyProfile.fromJson(json);

      expect(my.profile.preferredLanguage, 'English');
      expect(my.profile.allergies, isEmpty);
      expect(my.profile.familyMembers, isEmpty);
      expect(my.profile.displayName, 'Your profile');
      expect(my.email, isNull);
    });
  });
}
