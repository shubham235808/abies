import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../../catalogue/data/catalogue_api.dart';
import '../../consultations/data/consultations_api.dart';
import '../data/doctor_api.dart';

final doctorApiProvider = Provider<DoctorApi>((ref) => DoctorApiImpl(ref.watch(apiClientProvider)));
final consultationsApiProvider = Provider<ConsultationsApi>((ref) => ConsultationsApiImpl(ref.watch(apiClientProvider)));
final catalogueApiProvider = Provider<CatalogueApi>((ref) => CatalogueApiImpl(ref.watch(apiClientProvider)));
