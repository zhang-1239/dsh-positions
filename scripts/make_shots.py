# -*- coding: utf-8 -*-
"""把 4 张实机截图裁成 1280 宽、JPEG q88，替换仓库里的设计稿。"""
import os
from PIL import Image

BASE = r"C:\Users\lenovo\.dsh\attachments\v1\objects"
SHOTS = r"D:\PositionsWorkbench\plugin\docs\screenshots"

# 题注见 README：整页 / 展开测算 / 测算弹窗 / 分组弹窗
SRC = [
    (r"C:\Users\lenovo\.dsh\attachments\v1\objects\c8\c80768baff03303e2c8bf757f71bc8478d17e4f02c769734329af76ec670d6d9", "01-overview.jpg"),
    (r"C:\Users\lenovo\.dsh\attachments\v1\objects\18\18060d35984cbe229fc4e09d58d59979e98a844f1c1e5dafade9c5271f678eac", "02-calc.jpg"),
    (r"C:\Users\lenovo\.dsh\attachments\v1\objects\9f\9f24c071b99c354f19f29c0e925f420c0109f5be2af9e93f61fbfda71b709bf6", "03-modal.jpg"),
    (r"C:\Users\lenovo\.dsh\attachments\v1\objects\73\73691043694e731408df6f345c1fb01d2f4654b6e4ef22f4aeaee0f5aa96c4e5", "04-groups.jpg"),
]

os.makedirs(SHOTS, exist_ok=True)

for src, name in SRC:
    img = Image.open(src).convert("RGB")
    w, h = img.size
    if w > 1280:
        img = img.resize((1280, round(h * 1280 / w)), Image.LANCZOS)
    out = os.path.join(SHOTS, name)
    img.save(out, "JPEG", quality=88, optimize=True)
    print(name, img.size, os.path.getsize(out) // 1024, "KB")

# 删掉不再使用的第 5 张
old = os.path.join(SHOTS, "05-settings.jpg")
if os.path.exists(old):
    os.remove(old)
    print("removed 05-settings.jpg")

print("remaining:", sorted(os.listdir(SHOTS)))
