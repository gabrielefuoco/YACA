"""Daily rotation utilities for fresh recommendations."""

import random


class DailyRotation:
    """Utilities for rotating recommendations daily while maintaining quality."""

    @staticmethod
    def rotate_items(items: list, seed: str) -> list:
        """
        Rotate the items daily.

        This provides freshness while maintaining quality:
        - shuffled deterministically based on daily seed
        - User sees different content every day without sacrificing quality

        Args:
            items: List of items
            seed: Daily rotation seed (changes daily)

        Returns:
            Rotated list with items shuffled deterministically
        """

        # Deterministically shuffle items based on daily seed
        rng = random.Random(seed)
        shuffled_items = items.copy()
        rng.shuffle(shuffled_items)

        return shuffled_items
