from PIL import Image, ImageDraw, ImageFont

w, h = 900, 360
img = Image.new("RGB", (w, h), "white")
d = ImageDraw.Draw(img)
font = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 24)
bold = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 26)

d.text((30, 24), "成交记录", font=bold, fill="black")
rows = [
    ("日期", "方向", "价格", "数量", "股票"),
    ("2027-02-18", "买入", "18.50", "100", "示例股票B"),
    ("2027-03-02", "卖出", "11.00", "300", "示例股票A"),
]
x = 30
y = 90
cols = [30, 230, 360, 500, 640]
for i, r in enumerate(rows):
    for c, text in zip(cols, r):
        d.text((c, y), text, font=font, fill="black")
    y += 55
img.save(r"D:\PositionsWorkbench\plugin-design\test-recognize.png")
print("saved")
