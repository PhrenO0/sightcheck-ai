from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
root = Path(__file__).resolve().parent.parent
image = Image.new('RGB', (1000, 640), 'white')
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('C:/Windows/Fonts/consolab.ttf', 48)
for row in range(4):
    for col in range(5):
        x, y = 95 + col * 180, 80 + row * 145
        draw.rounded_rectangle((x-55, y-30, x+80, y+50), radius=8, outline='#c8cec1', width=2)
        draw.text((x+10, y+10), f'{"ABCD"[row]}{col+1}', font=font, fill='#152015', anchor='mm')
image.save(root / 'public' / 'sample-seatmap.png')
