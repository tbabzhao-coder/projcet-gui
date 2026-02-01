#!/usr/bin/env python3
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("正在安装 Pillow...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow"])
    from PIL import Image, ImageDraw, ImageFont

# 路径设置
script_dir = Path(__file__).parent
resources_dir = script_dir.parent / "resources"
iconset_dir = resources_dir / "icon.iconset"

# 创建 iconset 目录
iconset_dir.mkdir(exist_ok=True)

# 定义需要生成的尺寸
sizes = [
    (16, "icon_16x16.png"),
    (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"),
    (64, "icon_32x32@2x.png"),
    (64, "icon_64x64.png"),
    (128, "icon_64x64@2x.png"),
    (128, "icon_128x128.png"),
    (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"),
    (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"),
    (1024, "icon_512x512@2x.png"),
    (1024, "icon_1024x1024.png"),
]

def create_bot_icon(size):
    """创建 Bot 机器人图标"""
    # 创建图像
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 计算缩放比例
    scale = size / 1024
    
    # Apple 蓝色渐变背景 (简化为单色)
    bg_color = (0, 122, 255)  # #007AFF
    
    # 绘制圆角矩形背景
    margin = int(102 * scale)
    bg_size = int(820 * scale)
    corner_radius = int(180 * scale)
    
    draw.rounded_rectangle(
        [margin, margin, margin + bg_size, margin + bg_size],
        radius=corner_radius,
        fill=bg_color
    )
    
    # 机器人中心位置
    center_x = size // 2
    center_y = size // 2
    
    # 机器人头部
    head_width = int(360 * scale)
    head_height = int(280 * scale)
    head_x = center_x - head_width // 2
    head_y = center_y - int(120 * scale)
    head_corner = int(40 * scale)
    
    draw.rounded_rectangle(
        [head_x, head_y, head_x + head_width, head_y + head_height],
        radius=head_corner,
        fill='white'
    )
    
    # 天线
    antenna_width = int(12 * scale)
    antenna_top = center_y - int(200 * scale)
    antenna_bottom = center_y - int(120 * scale)
    
    draw.line(
        [(center_x, antenna_bottom), (center_x, antenna_top)],
        fill='white',
        width=antenna_width
    )
    
    # 天线顶部圆球
    ball_radius = int(24 * scale)
    draw.ellipse(
        [center_x - ball_radius, antenna_top - ball_radius,
         center_x + ball_radius, antenna_top + ball_radius],
        fill='white'
    )
    
    # 左眼
    eye_radius = int(32 * scale)
    left_eye_x = center_x - int(80 * scale)
    eye_y = center_y - int(40 * scale)
    
    draw.ellipse(
        [left_eye_x - eye_radius, eye_y - eye_radius,
         left_eye_x + eye_radius, eye_y + eye_radius],
        fill=bg_color
    )
    
    # 右眼
    right_eye_x = center_x + int(80 * scale)
    
    draw.ellipse(
        [right_eye_x - eye_radius, eye_y - eye_radius,
         right_eye_x + eye_radius, eye_y + eye_radius],
        fill=bg_color
    )
    
    # 嘴巴 (简化为弧线)
    mouth_y = center_y + int(40 * scale)
    mouth_width = int(120 * scale)
    mouth_height = int(40 * scale)
    
    draw.arc(
        [center_x - mouth_width // 2, mouth_y - mouth_height // 2,
         center_x + mouth_width // 2, mouth_y + mouth_height // 2],
        start=0, end=180,
        fill=bg_color,
        width=int(12 * scale)
    )
    
    # 左耳
    ear_width = int(40 * scale)
    ear_height = int(80 * scale)
    ear_corner = int(20 * scale)
    left_ear_x = center_x - int(220 * scale)
    ear_y = center_y - int(60 * scale)
    
    draw.rounded_rectangle(
        [left_ear_x, ear_y, left_ear_x + ear_width, ear_y + ear_height],
        radius=ear_corner,
        fill='white'
    )
    
    # 右耳
    right_ear_x = center_x + int(180 * scale)
    
    draw.rounded_rectangle(
        [right_ear_x, ear_y, right_ear_x + ear_width, ear_y + ear_height],
        radius=ear_corner,
        fill='white'
    )
    
    return img

def generate_main_png():
    """生成主 PNG 图标"""
    print("生成主 PNG 图标...")
    img = create_bot_icon(1024)
    png_path = resources_dir / "icon.png"
    img.save(png_path, 'PNG')
    print(f"✓ icon.png 已生成")

def generate_iconset():
    """生成 iconset 中的所有尺寸"""
    print("生成 iconset 图标...")
    for size, name in sizes:
        img = create_bot_icon(size)
        png_path = iconset_dir / name
        img.save(png_path, 'PNG')
        print(f"✓ {name} 已生成")

def generate_icns():
    """生成 ICNS (macOS)"""
    print("生成 ICNS 图标...")
    import subprocess
    try:
        icns_path = resources_dir / "icon.icns"
        subprocess.run(
            ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)],
            check=True,
            capture_output=True
        )
        print("✓ icon.icns 已生成")
    except subprocess.CalledProcessError as e:
        print(f"生成 ICNS 失败: {e}")
        print("请确保在 macOS 上运行此脚本")
    except FileNotFoundError:
        print("iconutil 命令未找到，请确保在 macOS 上运行")

def generate_ico():
    """生成 ICO (Windows)"""
    print("生成 ICO 图标...")
    try:
        # 生成多个尺寸用于 ICO
        ico_sizes = [16, 32, 48, 64, 128, 256]
        images = []
        
        for size in ico_sizes:
            img = create_bot_icon(size)
            images.append(img)
        
        # 保存为 ICO
        ico_path = resources_dir / "icon.ico"
        images[0].save(
            ico_path,
            format='ICO',
            sizes=[(img.width, img.height) for img in images]
        )
        
        print("✓ icon.ico 已生成")
    except Exception as e:
        print(f"生成 ICO 失败: {e}")

def main():
    print("开始生成 Bot 机器人图标...\n")
    
    try:
        generate_main_png()
        generate_iconset()
        generate_icns()
        generate_ico()
        
        print("\n✓ 所有图标生成完成！")
        print("\n图标特点:")
        print("- Apple 蓝色背景 (#007AFF)")
        print("- 可爱的机器人造型")
        print("- 圆角矩形设计")
        print("- 适配所有尺寸")
    except Exception as e:
        print(f"生成图标时出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
