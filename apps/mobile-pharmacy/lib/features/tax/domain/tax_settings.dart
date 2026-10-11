/// A pharmacy's GST registration profile — `TaxSettings`
/// (packages/domain/prisma/schema.prisma ~line 1480), one row per pharmacy.
///
/// Note what is NOT here: GST *rates*. Those live in `GstRateConfig`, keyed
/// by HSN code and managed only by ABIES admins
/// (`/api/v1/admin/configuration/gst-rates`). A pharmacy's part is (a) this
/// registration profile and (b) an HSN code on each medicine it sells, set
/// when adding a batch.
class TaxSettings {
  const TaxSettings({
    required this.legalBusinessName,
    required this.gstin,
    required this.registeredState,
    required this.stateCode,
    required this.invoicePrefix,
    this.active = true,
  });

  final String legalBusinessName;
  final String gstin;
  final String registeredState;
  final String stateCode;
  final String invoicePrefix;

  /// `recordSale` refuses to run unless a row exists AND this is true.
  final bool active;

  factory TaxSettings.fromJson(Map<String, dynamic> json) {
    return TaxSettings(
      legalBusinessName: json['legalBusinessName'] as String? ?? '',
      gstin: json['gstin'] as String? ?? '',
      registeredState: json['registeredState'] as String? ?? '',
      stateCode: json['stateCode'] as String? ?? '',
      invoicePrefix: json['invoicePrefix'] as String? ?? '',
      active: json['active'] as bool? ?? true,
    );
  }

  /// The exact `taxSettingsSchema` body (pharmacies.schemas.ts).
  Map<String, dynamic> toJson() => {
        'legalBusinessName': legalBusinessName,
        'gstin': gstin,
        'registeredState': registeredState,
        'stateCode': stateCode,
        'invoicePrefix': invoicePrefix,
      };
}

/// `taxSettingsSchema`'s GSTIN regex, verbatim.
final gstinPattern = RegExp(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z][0-9A-Z]$');

/// `taxSettingsSchema`'s invoice-prefix regex, verbatim.
final invoicePrefixPattern = RegExp(r'^[A-Z0-9-]+$');

/// Field-by-field validation matching `taxSettingsSchema` exactly
/// (legalBusinessName 1..200, GSTIN regex, registeredState 1..80,
/// stateCode 1..4, invoicePrefix 1..12 + regex). Returns null when valid.
/// Expects GSTIN/prefix already upper-cased, as the web form sends them.
String? validateTaxSettings(TaxSettings s) {
  if (s.legalBusinessName.trim().isEmpty) return 'Enter the legal business name';
  if (s.legalBusinessName.length > 200) return 'Legal business name must be at most 200 characters';
  if (!gstinPattern.hasMatch(s.gstin)) return 'Enter a valid 15-character GSTIN';
  if (s.registeredState.trim().isEmpty) return 'Enter the registered state';
  if (s.registeredState.length > 80) return 'Registered state must be at most 80 characters';
  if (s.stateCode.trim().isEmpty) return 'Enter the state code';
  if (s.stateCode.length > 4) return 'State code must be at most 4 characters';
  if (s.invoicePrefix.isEmpty) return 'Enter an invoice prefix';
  if (s.invoicePrefix.length > 12) return 'Invoice prefix must be at most 12 characters';
  if (!invoicePrefixPattern.hasMatch(s.invoicePrefix)) return 'Use only uppercase letters, numbers, and hyphens';
  return null;
}
