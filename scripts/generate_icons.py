#!/usr/bin/env python3
import os
import sys
from pathlib import Path

try:
    from PIL import Image
    import cairosvg
except ImportError:
    print("正在安装必要的库...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "cairosvg"])
    from PIL import Image
    import cairosvg

# 路径设置
script_dir = Path(__file__).parent
resources_dir = script_dir.parent / "resources"
svg_path = resources_dir / "icon.svg"
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

def svg_to_png(svg_path, png_path, size):
    """将 SVG 转换为指定尺寸的 PNG"""
    cairosvg.svg2png(
        url=str(svg_path),
        write_to=str(png_path),
        output_width=size,
        output_height=size
    )

def generate_main_png():
    """生成主 PNG 图标"""
    print("生成主 PNG 图标...")
    png_path = resources_dir / "icon.png"
    svg_to_png(svg_path, png_path, 1024)
    print(f"✓ icon.png 已生成")

def generate_iconset():
    """生成 iconset 中的所有尺寸"""
    print("生成 iconset 图标...")
    for size, name in sizes:
        png_path = iconset_dir / name
        svg_to_png(svg_path, png_path, size)
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
            # 先转换为 PNG
            temp_png = f"/tmp/icon_{size}.png"
            svg_to_png(svg_path, temp_png, size)
            img = Image.open(temp_png)
            images.append(img)
        
        # 保存为 ICO
        ico_path = resources_dir / "icon.ico"
        images[0].save(
            ico_path,
            format='ICO',
            sizes=[(img.width, img.height) for img in images]
        )
        
        # 清理临时文件
        for size in ico_sizes:
            temp_png = f"/tmp/icon_{size}.png"
            if os.path.exists(temp_png):
                os.remove(temp_png)
        
        print("✓ icon.ico 已生成")
    except Exception as e:
        print(f"生成 ICO 失败: {e}")

def main():
    print("开始生成图标...\n")
    
    if not svg_path.exists():
        print(f"错误: SVG 文件不存在: {svg_path}")
        sys.exit(1)
    
    try:
        generate_main_png()
        generate_iconset()
        generate_icns()
        generate_ico()
        
        print("\n✓ 所有图标生成完成！")
    except Exception as e:
        print(f"生成图标时出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
