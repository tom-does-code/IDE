"""Render the Forge application icon. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

OUTPUT = Path(__file__).resolve().parents[1] / "assets"
SIZE = 1024


def render():
    image = Image.new("RGBA", (SIZE, SIZE))
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).rounded_rectangle((40, 40, 984, 984), radius=218, fill=255)
    background = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(background)
    for y in range(SIZE):
        factor = y / SIZE
        color = tuple(round(a * (1 - factor) + b * factor) for a, b in zip((43, 30, 29), (22, 18, 24)))
        draw.line((0, y, SIZE, y), fill=color + (255,))
    image.paste(background, (0, 0), mask)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((46, 46, 978, 978), radius=212, outline="#785047", width=12)

    # An angled F with a bright upper edge and copper foot.
    silhouette = [(325, 239), (815, 239), (730, 356), (467, 356),
                  (435, 447), (675, 447), (595, 558), (396, 558),
                  (313, 779), (184, 779)]
    mark = Image.new("L", image.size)
    ImageDraw.Draw(mark).polygon(silhouette, fill=255)
    gradient = Image.new("RGBA", image.size)
    paint = ImageDraw.Draw(gradient)
    for y in range(SIZE):
        factor = max(0, min(1, (y - 239) / 540))
        color = tuple(round(a * (1 - factor) + b * factor) for a, b in zip((255, 217, 153), (246, 123, 71)))
        paint.line((0, y, SIZE, y), fill=color + (255,))
    image.paste(gradient, (0, 0), mark)
    draw = ImageDraw.Draw(image)
    draw.polygon([(677, 773), (731, 683), (812, 683), (758, 773)], fill="#ff795c")
    return image


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    icon = render().resize((256, 256), Image.Resampling.LANCZOS)
    icon.save(OUTPUT / "forge.png")
    icon.save(OUTPUT / "forge.ico", sizes=[(n, n) for n in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
