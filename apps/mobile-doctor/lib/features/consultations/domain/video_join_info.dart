/// `POST /api/v1/consultations/[id]/join` → `resolveJoinInfo()`
/// (packages/domain/src/lib/video/index.ts). Today always
/// `available: false` with an honest "coordinate directly" message — there
/// is no live video provider wired up anywhere on the platform yet.
class VideoJoinInfo {
  const VideoJoinInfo({required this.available, required this.message});

  final bool available;
  final String message;

  factory VideoJoinInfo.fromJson(Map<String, dynamic> json) =>
      VideoJoinInfo(available: json['available'] as bool? ?? false, message: json['message'] as String? ?? '');
}
