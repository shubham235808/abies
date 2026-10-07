import 'package:flutter/material.dart';

/// Generic shimmer-free loading placeholder for list/card content
/// (docs/mobile/MOBILE-ARCHITECTURE.md §1, "loading skeletons"). Deliberately
/// simple for Phase 1 — a real shimmer animation is a design-system
/// refinement, not a foundation-layer concern.
class LoadingSkeleton extends StatelessWidget {
  const LoadingSkeleton({super.key, this.height = 16, this.width});

  final double height;
  final double? width;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      width: width,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
    );
  }
}
