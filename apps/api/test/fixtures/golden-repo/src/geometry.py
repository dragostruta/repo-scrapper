import math


def circle_area(radius: float) -> float:
    """Returns the area of a circle with the given radius."""
    return math.pi * radius ** 2


def rectangle_perimeter(width: float, height: float) -> float:
    """Returns the perimeter of a rectangle with the given width and height."""
    return 2 * (width + height)
