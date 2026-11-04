"""Braille Encoding Service for TouchRoute Tactile Maps.

Implements standard Grade 1 (uncontracted) Unified English Braille (UEB)
and Marburg Medium tactile signage specification for blind and low-vision users.
Supports Unicode Braille Pattern mapping and 2D/3D physical dot coordinate extraction.
"""

from typing import Dict, List, Set, Tuple

# Mapping of characters to 6-dot numbers (1 through 6)
# Standard 6-dot cell layout:
# 1  4
# 2  5
# 3  6
BRAILLE_ALPHABET: Dict[str, List[int]] = {
    "a": [1],
    "b": [1, 2],
    "c": [1, 4],
    "d": [1, 4, 5],
    "e": [1, 5],
    "f": [1, 2, 4],
    "g": [1, 2, 4, 5],
    "h": [1, 2, 5],
    "i": [2, 4],
    "j": [2, 4, 5],
    "k": [1, 3],
    "l": [1, 2, 3],
    "m": [1, 3, 4],
    "n": [1, 3, 4, 5],
    "o": [1, 3, 5],
    "p": [1, 2, 3, 4],
    "q": [1, 2, 3, 4, 5],
    "r": [1, 2, 3, 5],
    "s": [2, 3, 4],
    "t": [2, 3, 4, 5],
    "u": [1, 3, 6],
    "v": [1, 2, 3, 6],
    "w": [2, 4, 5, 6],
    "x": [1, 3, 4, 6],
    "y": [1, 3, 4, 5, 6],
    "z": [1, 3, 5, 6],
    " ": [],
    ",": [2],
    ";": [2, 3],
    ":": [2, 5],
    ".": [2, 5, 6],
    "!": [2, 3, 5],
    "?": [2, 3, 6],
    "-": [3, 6],
    "/": [3, 4],
    "#": [3, 4, 5, 6],  # Number prefix sign
}

# Digits 0-9 in Braille are represented by letters a-j preceded by the number indicator (#)
DIGIT_TO_LETTER = {
    "1": "a",
    "2": "b",
    "3": "c",
    "4": "d",
    "5": "e",
    "6": "f",
    "7": "g",
    "8": "h",
    "9": "i",
    "0": "j",
}

NUMBER_SIGN_DOTS = [3, 4, 5, 6]

# Standard Marburg Medium physical dimensions (in millimeters)
# Conforms to ISO 21542, ADA Standards 703, and Tactile Signage Guidelines
DOT_DIAMETER_MM: float = 1.5
DOT_HEIGHT_MM: float = 0.7
DOT_SPACING_MM: float = 2.5      # Distance between dot centers within a cell
CELL_SPACING_MM: float = 6.0     # Distance between start of one cell and start of next
LINE_SPACING_MM: float = 10.0    # Distance between lines of Braille text


def dots_to_unicode(dots: List[int]) -> str:
    """Converts a list of active dot indices (1..6) to a Unicode Braille character (U+2800..U+283F)."""
    val = 0
    for d in dots:
        if 1 <= d <= 6:
            val |= 1 << (d - 1)
    return chr(0x2800 + val)


def text_to_braille_cells(text: str) -> List[List[int]]:
    """Encodes standard plain text into a sequence of Braille cells (lists of active dot numbers).

    Properly handles numbers by prepending the UEB numeric indicator (dots 3-4-5-6).
    """
    cells: List[List[int]] = []
    in_number_mode = False

    for char in text.lower():
        if char.isdigit():
            if not in_number_mode:
                cells.append(NUMBER_SIGN_DOTS)
                in_number_mode = True
            letter_equiv = DIGIT_TO_LETTER[char]
            cells.append(BRAILLE_ALPHABET[letter_equiv])
        elif char in BRAILLE_ALPHABET:
            in_number_mode = False
            cells.append(BRAILLE_ALPHABET[char])
        elif char.isalpha():
            in_number_mode = False
            # Fallback for unexpected unicode letters
            cells.append(BRAILLE_ALPHABET.get(char, []))
        else:
            in_number_mode = False
            # Treat unknown punctuation as a single empty space
            cells.append([])

    return cells


def text_to_braille_unicode(text: str) -> str:
    """Converts text into a string of Unicode Braille Pattern characters."""
    cells = text_to_braille_cells(text)
    return "".join(dots_to_unicode(c) for c in cells)


def get_braille_dot_coordinates(
    text: str,
    origin_x: float,
    origin_y: float,
    dot_spacing: float = DOT_SPACING_MM,
    cell_spacing: float = CELL_SPACING_MM,
    y_direction_down: bool = True,
) -> List[Tuple[float, float]]:
    """Calculates the physical 2D coordinates (x, y) for every raised dot in the Braille string.

    Grid within each cell (when y_direction_down=True, as in SVG/screen coords):
      Dot 1: (0, 0)                  Dot 4: (dot_spacing, 0)
      Dot 2: (0, dot_spacing)        Dot 5: (dot_spacing, dot_spacing)
      Dot 3: (0, 2*dot_spacing)      Dot 6: (dot_spacing, 2*dot_spacing)

    When y_direction_down=False (for Cartesian 3D where +Y is North/upwards):
      Dot 1: (0, 2*dot_spacing)      Dot 4: (dot_spacing, 2*dot_spacing)
      Dot 2: (0, dot_spacing)        Dot 5: (dot_spacing, dot_spacing)
      Dot 3: (0, 0)                  Dot 6: (dot_spacing, 0)

    Returns:
        List of (x, y) coordinates in millimeters from origin_x, origin_y.
    """
    cells = text_to_braille_cells(text)
    coords: List[Tuple[float, float]] = []

    if y_direction_down:
        dot_offsets: Dict[int, Tuple[float, float]] = {
            1: (0.0, 0.0),
            2: (0.0, dot_spacing),
            3: (0.0, 2.0 * dot_spacing),
            4: (dot_spacing, 0.0),
            5: (dot_spacing, dot_spacing),
            6: (dot_spacing, 2.0 * dot_spacing),
        }
    else:
        # In Cartesian 3D, Dot 1 is top/North (highest Y), Dot 3 is bottom/South (lowest Y)
        dot_offsets = {
            1: (0.0, 2.0 * dot_spacing),
            2: (0.0, dot_spacing),
            3: (0.0, 0.0),
            4: (dot_spacing, 2.0 * dot_spacing),
            5: (dot_spacing, dot_spacing),
            6: (dot_spacing, 0.0),
        }

    current_cell_x = origin_x
    for cell in cells:
        for dot in cell:
            if dot in dot_offsets:
                dx, dy = dot_offsets[dot]
                coords.append((round(current_cell_x + dx, 3), round(origin_y + dy, 3)))
        current_cell_x += cell_spacing

    return coords

