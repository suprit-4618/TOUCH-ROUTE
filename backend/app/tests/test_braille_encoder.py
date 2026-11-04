import pytest
from app.services.tactile.braille import (
    dots_to_unicode,
    get_braille_dot_coordinates,
    text_to_braille_cells,
    text_to_braille_unicode,
)


def test_alphabet_braille_encoding():
    # 'a' is dot 1 -> ⠁ (U+2801)
    assert dots_to_unicode([1]) == "⠁"
    assert text_to_braille_unicode("a") == "⠁"

    # 'b' is dots 1, 2 -> ⠃ (U+2803)
    assert text_to_braille_unicode("b") == "⠃"

    # 'c' is dots 1, 4 -> ⠉ (U+2809)
    assert text_to_braille_unicode("c") == "⠉"

    # 'ent' -> 'e' (1,5) 'n' (1,3,4,5) 't' (2,3,4,5)
    ent_braille = text_to_braille_unicode("ent")
    assert len(ent_braille) == 3
    assert ent_braille == "⠑⠝⠞"


def test_numeric_braille_encoding_with_number_sign():
    # In UEB Braille, digits are preceded by the number indicator (# = dots 3-4-5-6, ⠼)
    # "1" -> #a (⠼⠁)
    cells_1 = text_to_braille_cells("1")
    assert len(cells_1) == 2
    assert cells_1[0] == [3, 4, 5, 6]  # Number sign
    assert cells_1[1] == [1]            # 'a' for 1

    # "101" -> # a j a
    cells_101 = text_to_braille_cells("101")
    assert len(cells_101) == 4
    assert cells_101[0] == [3, 4, 5, 6]
    assert text_to_braille_unicode("101") == "⠼⠁⠚⠁"


def test_punctuation_and_spaces():
    cells = text_to_braille_cells("wc 1")
    # 'w', 'c', space, '#', '1'
    assert len(cells) == 5
    assert cells[2] == []  # Empty cell for space


def test_braille_dot_coordinates_generation():
    # Label "a" has 1 dot at (origin_x, origin_y)
    coords = get_braille_dot_coordinates("a", origin_x=10.0, origin_y=20.0)
    assert len(coords) == 1
    assert coords[0] == (10.0, 20.0)

    # Label "b" has 2 dots: dot 1 at (10, 20) and dot 2 at (10, 22.5) with default 2.5mm spacing
    coords_b = get_braille_dot_coordinates("b", origin_x=10.0, origin_y=20.0, dot_spacing=2.5)
    assert len(coords_b) == 2
    assert coords_b[0] == (10.0, 20.0)
    assert coords_b[1] == (10.0, 22.5)

    # All generated coordinates must be valid finite floats
    coords_long = get_braille_dot_coordinates("room 204", origin_x=0.0, origin_y=0.0)
    assert len(coords_long) > 10
    for x, y in coords_long:
        assert isinstance(x, float)
        assert isinstance(y, float)
        assert x >= 0.0

