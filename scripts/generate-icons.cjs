const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../resources/icon.svg');
const resourcesDir = path.join(__dirname, '../resources');
const iconsetDir = path.join(resourcesDir, 'icon.iconset');

// 确保 iconset 目录存在
if (!fs.existsSync(iconsetDir)) {
  fs.mkdirSync(iconsetDir, { recursive: true });
}

// 读取 SVG 文件
const svgBuffer = fs.readFileSync(svgPath);

// 定义需要生成的尺寸
const sizes = [
  { size: 16, name: 'icon_16x16.png' },
  { size: 32, name: 'icon_16x16@2x.png' },
  { size: 32, name: 'icon_32x32.png' },
  { size: 64, name: 'icon_32x32@2x.png' },
  { size: 64, name: 'icon_64x64.png' },
  { size: 128, name: 'icon_64x64@2x.png' },
  { size: 128, name: 'icon_128x128.png' },
  { size: 256, name: 'icon_128x128@2x.png' },
  { size: 256, name: 'icon_256x256.png' },
  { size: 512, name: 'icon_256x256@2x.png' },
  { size: 512, name: 'icon_512x512.png' },
  { size: 1024, name: 'icon_512x512@2x.png' },
  { size: 1024, name: 'icon_1024x1024.png' },
];

// 生成主 PNG 图标
async function generateMainPNG() {
  console.log('生成主 PNG 图标...');
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .toFile(path.join(resourcesDir, 'icon.png'));
  console.log('✓ icon.png 已生成');
}

// 生成 iconset 中的所有尺寸
async function generateIconset() {
  console.log('生成 iconset 图标...');
  for (const { size, name } of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .toFile(path.join(iconsetDir, name));
    console.log(`✓ ${name} 已生成`);
  }
}

// 生成 ICNS (macOS)
async function generateICNS() {
  console.log('生成 ICNS 图标...');
  const { execSync } = require('child_process');
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(resourcesDir, 'icon.icns')}"`, {
      stdio: 'inherit'
    });
    console.log('✓ icon.icns 已生成');
  } catch (error) {
    console.error('生成 ICNS 失败:', error.message);
    console.log('请确保在 macOS 上运行此脚本');
  }
}

// 生成 ICO (Windows)
async function generateICO() {
  console.log('生成 ICO 图标...');
  try {
    // 使用简单的方法：保存 256x256 的 PNG 作为 ICO
    await sharp(svgBuffer)
      .resize(256, 256)
      .toFile(path.join(resourcesDir, 'icon.ico'));
    
    console.log('✓ icon.ico 已生成 (简化版本)');
    console.log('注意：如需完整的 ICO 文件，请使用专门的 ICO 转换工具');
  } catch (error) {
    console.error('生成 ICO 失败:', error.message);
  }
}

// 主函数
async function main() {
  console.log('开始生成图标...\n');
  
  try {
    await generateMainPNG();
    await generateIconset();
    await generateICNS();
    await generateICO();
    
    console.log('\n✓ 所有图标生成完成！');
  } catch (error) {
    console.error('生成图标时出错:', error);
    process.exit(1);
  }
}

main();
